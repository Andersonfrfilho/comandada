import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { ChargeCapablePaymentProvider } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import { decrypt, encrypt } from '@/infra/crypto/SecretCipher'
import type { PaymentGatewayCredentials, PaymentGatewayFactory } from '@/shared/providers/PaymentGatewayProvider'

type Database = NodePgDatabase<typeof schema>

type StoredCredentials = { accessToken: string; webhookSecret: string }

export type ResolvedPaymentAccount = {
  readonly account: schema.PaymentAccount
  readonly gateway: ChargeCapablePaymentProvider
}

export function sealCredentials(credentials: StoredCredentials): string {
  return encrypt(JSON.stringify(credentials))
}

function openCredentials(sealed: string): StoredCredentials {
  const parsed: unknown = JSON.parse(decrypt(sealed))
  if (typeof parsed !== 'object' || parsed === null) return { accessToken: '', webhookSecret: '' }
  const record = parsed as Record<string, unknown>
  return {
    accessToken: typeof record['accessToken'] === 'string' ? record['accessToken'] : '',
    webhookSecret: typeof record['webhookSecret'] === 'string' ? record['webhookSecret'] : '',
  }
}

// Conta do restaurante + gateway pronto para cobrar. A credencial só existe decifrada aqui dentro.
export class PaymentAccountService {
  constructor(
    private readonly db: Database,
    private readonly gatewayFactory: PaymentGatewayFactory
  ) {}

  async findAccount(params: { establishmentId: string; provider: string }): Promise<schema.PaymentAccount | undefined> {
    return this.db.query.paymentAccounts.findFirst({
      where: and(
        eq(schema.paymentAccounts.establishmentId, params.establishmentId),
        eq(schema.paymentAccounts.provider, params.provider)
      ),
    })
  }

  async findActive(establishmentId: string): Promise<schema.PaymentAccount | undefined> {
    return this.db.query.paymentAccounts.findFirst({
      where: and(eq(schema.paymentAccounts.establishmentId, establishmentId), eq(schema.paymentAccounts.active, true)),
    })
  }

  readCredentials(account: schema.PaymentAccount): StoredCredentials {
    return openCredentials(account.credentials)
  }

  gatewayFor(account: schema.PaymentAccount): ChargeCapablePaymentProvider {
    const stored = openCredentials(account.credentials)
    const credentials: PaymentGatewayCredentials = { ...stored, payerEmail: account.payerEmail }
    return this.gatewayFactory.create({ provider: account.provider, credentials })
  }

  async resolveActive(establishmentId: string): Promise<ResolvedPaymentAccount | undefined> {
    const account = await this.findActive(establishmentId)
    if (!account) return undefined
    return { account, gateway: this.gatewayFor(account) }
  }
}
