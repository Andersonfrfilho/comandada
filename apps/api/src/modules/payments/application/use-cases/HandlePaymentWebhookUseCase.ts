import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  CHARGE_KIND,
  CHARGE_STATUS,
  PAYMENT_EVENT_TYPE,
  PAYMENT_METHOD,
  PaymentProviderNotConfiguredError,
} from '@adatechnology/payment-contracts'
import type { IncomingWebhook, PaymentEvent } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import type { PaymentAccountService } from '../services/PaymentAccountService'
import type { OrderPaymentTransitions } from '../services/OrderPaymentTransitions'

type Database = NodePgDatabase<typeof schema>

export interface HandlePaymentWebhookParams {
  establishmentId: string
  provider: string
  webhook: IncomingWebhook
  now: Date
}

export type HandlePaymentWebhookResult = {
  readonly eventId: string
  readonly type: string
  readonly duplicate: boolean
  readonly applied: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Webhook do provedor → pedido. A assinatura e o estado real ficam no provedor do SDK (que relê o
// pagamento na API com o token do restaurante); aqui só aplicamos, uma vez por evento.
export class HandlePaymentWebhookUseCase {
  constructor(
    private readonly db: Database,
    private readonly accounts: Pick<PaymentAccountService, 'findAccount' | 'gatewayFor'>,
    private readonly transitions: Pick<OrderPaymentTransitions, 'findOrder' | 'markPaid' | 'markFailed' | 'markRefunded'>
  ) {}

  async execute(params: HandlePaymentWebhookParams): Promise<HandlePaymentWebhookResult> {
    const account = await this.accounts.findAccount({ establishmentId: params.establishmentId, provider: params.provider })
    if (!account || !account.active) throw new PaymentProviderNotConfiguredError(params.provider)
    const event = await this.accounts.gatewayFor(account).parseWebhook(params.webhook)

    const orderId = event.customerRef && UUID_PATTERN.test(event.customerRef) ? event.customerRef : null
    const order = orderId ? await this.transitions.findOrder({ establishmentId: params.establishmentId, orderId }) : undefined

    const [recorded] = await this.db
      .insert(schema.paymentWebhookEvents)
      .values({
        establishmentId: params.establishmentId,
        provider: event.provider,
        eventId: event.eventId,
        type: event.type,
        orderId: order?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.paymentWebhookEvents.id })
    if (!recorded) return { eventId: event.eventId, type: event.type, duplicate: true, applied: false }
    if (!order) return { eventId: event.eventId, type: event.type, duplicate: false, applied: false }

    const applied = await this.apply(order, event, params.now)
    return { eventId: event.eventId, type: event.type, duplicate: false, applied }
  }

  private async apply(
    order: NonNullable<Awaited<ReturnType<OrderPaymentTransitions['findOrder']>>>,
    event: PaymentEvent,
    now: Date
  ): Promise<boolean> {
    switch (event.type) {
      case PAYMENT_EVENT_TYPE.PAYMENT_APPROVED:
        return this.transitions.markPaid(
          order,
          {
            provider: event.provider,
            providerPaymentId: event.transactionId,
            amount: event.amount ? event.amount.cents / 100 : null,
            kind: event.paymentMethod
              ? event.paymentMethod === PAYMENT_METHOD.PIX
                ? CHARGE_KIND.PIX
                : CHARGE_KIND.PAYMENT_LINK
              : null,
          },
          now
        )
      case PAYMENT_EVENT_TYPE.PAYMENT_FAILED:
        return this.transitions.markFailed(order, now)
      case PAYMENT_EVENT_TYPE.PAYMENT_REFUNDED:
        return this.transitions.markRefunded(order, CHARGE_STATUS.REFUNDED)
      case PAYMENT_EVENT_TYPE.PAYMENT_CHARGEBACK:
        return this.transitions.markRefunded(order, CHARGE_STATUS.CHARGEBACK)
      default:
        return false
    }
  }
}
