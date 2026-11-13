import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ValidationError } from '@/shared/errors/AppError'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { sealCredentials } from '../services/PaymentAccountService'
import type { PaymentAccountService } from '../services/PaymentAccountService'
import { PAYMENT_ERROR_MESSAGES } from '../../shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

export interface UpsertPaymentAccountParams {
  establishmentId: string
  userId: string
  provider: string
  // Em branco mantém o que já está salvo: o painel não tem como mostrar o valor de volta.
  accessToken?: string | undefined
  webhookSecret?: string | undefined
  payerEmail?: string | null | undefined
  pixEnabled: boolean
  cardLinkEnabled: boolean
  expirationMinutes: number
  active: boolean
}

const TOKEN_HINT_LENGTH = 4

export class UpsertPaymentAccountUseCase {
  constructor(
    private readonly db: Database,
    private readonly accounts: Pick<PaymentAccountService, 'findAccount' | 'readCredentials'>,
    private readonly audit?: Pick<CreateAuditLogUseCase, 'execute'>
  ) {}

  async execute(params: UpsertPaymentAccountParams): Promise<void> {
    const existing = await this.accounts.findAccount({ establishmentId: params.establishmentId, provider: params.provider })
    const previous = existing ? this.accounts.readCredentials(existing) : { accessToken: '', webhookSecret: '' }
    const accessToken = params.accessToken?.trim() || previous.accessToken
    const webhookSecret = params.webhookSecret?.trim() || previous.webhookSecret
    if (params.active && (!accessToken || !webhookSecret)) {
      throw new ValidationError(PAYMENT_ERROR_MESSAGES.credentialsRequired, {
        ...(accessToken ? {} : { accessToken: ['required'] }),
        ...(webhookSecret ? {} : { webhookSecret: ['required'] }),
      })
    }
    const values = {
      credentials: sealCredentials({ accessToken, webhookSecret }),
      accessTokenHint: accessToken ? accessToken.slice(-TOKEN_HINT_LENGTH) : null,
      payerEmail: params.payerEmail?.trim() || null,
      pixEnabled: params.pixEnabled,
      cardLinkEnabled: params.cardLinkEnabled,
      expirationMinutes: params.expirationMinutes,
      active: params.active,
      updatedAt: new Date(),
    }
    await this.db
      .insert(schema.paymentAccounts)
      .values({ establishmentId: params.establishmentId, provider: params.provider, ...values })
      .onConflictDoUpdate({
        target: [schema.paymentAccounts.establishmentId, schema.paymentAccounts.provider],
        set: values,
      })
    await this.audit
      ?.execute({
        establishmentId: params.establishmentId,
        userId: params.userId,
        action: 'payment_account.updated',
        resourceType: 'payment_account',
        resourceId: params.provider,
        metadata: {
          provider: params.provider,
          active: params.active,
          pixEnabled: params.pixEnabled,
          cardLinkEnabled: params.cardLinkEnabled,
          credentialsChanged: Boolean(params.accessToken?.trim() || params.webhookSecret?.trim()),
        },
      })
      .catch((error: unknown) => console.error('[Payments] audit failed:', error instanceof Error ? error.message : error))
  }
}
