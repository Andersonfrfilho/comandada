import type { PaymentAccountService } from '../services/PaymentAccountService'
import { PAYMENT_PROVIDER } from '../../shared/payments.constant'

export type PaymentAccountView = {
  readonly provider: string
  readonly connected: boolean
  readonly active: boolean
  readonly accessTokenHint: string | null
  readonly hasWebhookSecret: boolean
  readonly payerEmail: string | null
  readonly pixEnabled: boolean
  readonly cardLinkEnabled: boolean
  readonly expirationMinutes: number
  // URL que o restaurante cola em "Webhooks" no Mercado Pago.
  readonly webhookUrl: string
}

export function buildPaymentWebhookUrl(params: { publicApiUrl: string; provider: string; establishmentId: string }): string {
  return `${params.publicApiUrl.replace(/\/$/, '')}/webhooks/payments/${params.provider}/${params.establishmentId}`
}

// O painel nunca recebe a credencial: só se está ligada e o final do token.
export class GetPaymentAccountUseCase {
  constructor(
    private readonly accounts: Pick<PaymentAccountService, 'findAccount' | 'readCredentials'>,
    private readonly publicApiUrl: string
  ) {}

  async execute(params: { establishmentId: string; provider?: string }): Promise<PaymentAccountView> {
    const provider = params.provider ?? PAYMENT_PROVIDER.MERCADOPAGO
    const account = await this.accounts.findAccount({ establishmentId: params.establishmentId, provider })
    const webhookUrl = buildPaymentWebhookUrl({ publicApiUrl: this.publicApiUrl, provider, establishmentId: params.establishmentId })
    if (!account) {
      return {
        provider,
        connected: false,
        active: false,
        accessTokenHint: null,
        hasWebhookSecret: false,
        payerEmail: null,
        pixEnabled: true,
        cardLinkEnabled: true,
        expirationMinutes: 30,
        webhookUrl,
      }
    }
    const credentials = this.accounts.readCredentials(account)
    return {
      provider,
      connected: credentials.accessToken.length > 0,
      active: account.active,
      accessTokenHint: account.accessTokenHint,
      hasWebhookSecret: credentials.webhookSecret.length > 0,
      payerEmail: account.payerEmail,
      pixEnabled: account.pixEnabled,
      cardLinkEnabled: account.cardLinkEnabled,
      expirationMinutes: account.expirationMinutes,
      webhookUrl,
    }
  }
}
