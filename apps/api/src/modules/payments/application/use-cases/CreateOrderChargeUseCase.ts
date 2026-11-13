import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { CHARGE_KIND } from '@adatechnology/payment-contracts'
import type { ChargeKind } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import type { PaymentAccountService } from '../services/PaymentAccountService'
import { buildPaymentWebhookUrl } from './GetPaymentAccountUseCase'
import { ORDER_PAYMENT_STATUS, PAYMENT_EXPIRATION_MINUTES } from '../../shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

export interface CreateOrderChargeParams {
  establishmentId: string
  orderId: string
  orderCode: string
  kind: ChargeKind
  // Total já calculado pelo catálogo (itens + entrega), em reais.
  amount: number
  now: Date
}

// O que o bot manda ao cliente.
export type OrderChargeResult =
  | {
      readonly status: 'created'
      readonly kind: ChargeKind
      readonly amount: number
      readonly expiresAt: string
      readonly expirationMinutes: number
      readonly pixCopyPaste?: string | undefined
      readonly ticketUrl?: string | undefined
      readonly paymentUrl?: string | undefined
    }
  | { readonly status: 'unavailable'; readonly kind: ChargeKind }

function clampMinutes(minutes: number): number {
  return Math.min(Math.max(minutes, PAYMENT_EXPIRATION_MINUTES.MIN), PAYMENT_EXPIRATION_MINUTES.MAX)
}

// Gera a cobrança do pedido na conta do restaurante e segura o pedido fora da cozinha até pagar.
// Se o provedor falha, o pedido segue como antes (paga na entrega/retirada): perder a venda é pior.
export class CreateOrderChargeUseCase {
  constructor(
    private readonly db: Database,
    private readonly accounts: Pick<PaymentAccountService, 'resolveActive'>,
    private readonly publicApiUrl: string
  ) {}

  // Esta forma de pagamento vira cobrança online neste restaurante?
  async isEnabled(params: { establishmentId: string; kind: ChargeKind }): Promise<boolean> {
    const resolved = await this.accounts.resolveActive(params.establishmentId)
    if (!resolved) return false
    return params.kind === CHARGE_KIND.PIX ? resolved.account.pixEnabled : resolved.account.cardLinkEnabled
  }

  async execute(params: CreateOrderChargeParams): Promise<OrderChargeResult | undefined> {
    const resolved = await this.accounts.resolveActive(params.establishmentId)
    if (!resolved) return undefined
    const { account, gateway } = resolved
    const enabled = params.kind === CHARGE_KIND.PIX ? account.pixEnabled : account.cardLinkEnabled
    if (!enabled || !gateway.chargeKinds.includes(params.kind)) return undefined

    const expirationMinutes = clampMinutes(account.expirationMinutes)
    const expiresAt = new Date(params.now.getTime() + expirationMinutes * 60_000)
    try {
      const charge = await gateway.createCharge({
        kind: params.kind,
        amount: { cents: Math.round(params.amount * 100), currency: 'BRL' },
        reference: params.orderId,
        description: `Pedido ${params.orderCode}`,
        idempotencyKey: `order-${params.orderId}-${params.kind}`,
        expiresAt,
        notificationUrl: buildPaymentWebhookUrl({
          publicApiUrl: this.publicApiUrl,
          provider: account.provider,
          establishmentId: params.establishmentId,
        }),
      })
      await this.db.insert(schema.paymentCharges).values({
        establishmentId: params.establishmentId,
        orderId: params.orderId,
        provider: account.provider,
        kind: params.kind,
        providerChargeId: charge.id,
        status: charge.status,
        amount: params.amount.toFixed(2),
        pixCopyPaste: charge.pix?.copyPaste ?? null,
        paymentUrl: charge.paymentUrl ?? charge.pix?.ticketUrl ?? null,
        expiresAt: charge.expiresAt ?? expiresAt,
      })
      await this.db
        .update(schema.orders)
        .set({ paymentStatus: ORDER_PAYMENT_STATUS.AWAITING })
        .where(eq(schema.orders.id, params.orderId))
      return {
        status: 'created',
        kind: params.kind,
        amount: params.amount,
        expiresAt: (charge.expiresAt ?? expiresAt).toISOString(),
        expirationMinutes,
        pixCopyPaste: charge.pix?.copyPaste,
        ticketUrl: charge.pix?.ticketUrl ?? undefined,
        paymentUrl: charge.paymentUrl,
      }
    } catch (error) {
      console.error('[Payments] charge creation failed:', error instanceof Error ? error.message : error)
      return { status: 'unavailable', kind: params.kind }
    }
  }
}
