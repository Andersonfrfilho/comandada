import { createMercadoPagoPaymentProvider } from '@adatechnology/mercadopago-payment-provider'
import type { ChargeCapablePaymentProvider } from '@adatechnology/payment-contracts'
import type { PaymentGatewayCredentials, PaymentGatewayFactory } from '@/shared/providers/PaymentGatewayProvider'
import { ValidationError } from '@/shared/errors/AppError'
import { PAYMENT_ERROR_MESSAGES, PAYMENT_PROVIDER } from '../../shared/payments.constant'

// Uma instância por conta: o access token é do restaurante, o provedor do SDK não guarda estado.
export class MercadoPagoGatewayFactoryImplementation implements PaymentGatewayFactory {
  readonly supportedProviders = [PAYMENT_PROVIDER.MERCADOPAGO] as const

  create(params: { provider: string; credentials: PaymentGatewayCredentials }): ChargeCapablePaymentProvider {
    if (params.provider !== PAYMENT_PROVIDER.MERCADOPAGO) {
      throw new ValidationError(PAYMENT_ERROR_MESSAGES.providerUnsupported, { provider: [params.provider] })
    }
    return createMercadoPagoPaymentProvider({
      accessToken: params.credentials.accessToken,
      webhookSecret: params.credentials.webhookSecret,
      fallbackPayerEmail: params.credentials.payerEmail ?? undefined,
    })
  }
}
