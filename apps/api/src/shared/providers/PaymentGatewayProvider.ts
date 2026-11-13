import type { ChargeCapablePaymentProvider } from '@adatechnology/payment-contracts'

/**
 * Quem cobra online. Cada restaurante tem a própria conta: o gateway é criado por conta, com a
 * credencial dela, e o dinheiro cai direto no restaurante. Implementação de hoje: Mercado Pago
 * (`@adatechnology/mercadopago-payment-provider`); outro provedor (Stone...) é outra implementação.
 */
export type PaymentGatewayCredentials = {
  readonly accessToken: string
  readonly webhookSecret: string
  readonly payerEmail: string | null
}

export interface PaymentGatewayFactory {
  readonly supportedProviders: readonly string[]
  create(params: { provider: string; credentials: PaymentGatewayCredentials }): ChargeCapablePaymentProvider
}
