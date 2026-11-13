import { z } from 'zod'
import { PaymentError } from '@adatechnology/payment-contracts'
import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { GetPaymentAccountUseCase } from '../../application/use-cases/GetPaymentAccountUseCase'
import type { UpsertPaymentAccountUseCase } from '../../application/use-cases/UpsertPaymentAccountUseCase'
import type { HandlePaymentWebhookUseCase } from '../../application/use-cases/HandlePaymentWebhookUseCase'
import { PAYMENT_EXPIRATION_MINUTES, PAYMENT_PROVIDER, PAYMENT_PROVIDER_VALUES } from '../../shared/payments.constant'

const upsertSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDER_VALUES).default(PAYMENT_PROVIDER.MERCADOPAGO),
  accessToken: z.string().trim().max(300).optional(),
  webhookSecret: z.string().trim().max(300).optional(),
  payerEmail: z.string().trim().email().max(255).nullable().optional(),
  pixEnabled: z.boolean().default(true),
  cardLinkEnabled: z.boolean().default(true),
  expirationMinutes: z
    .number()
    .int()
    .min(PAYMENT_EXPIRATION_MINUTES.MIN)
    .max(PAYMENT_EXPIRATION_MINUTES.MAX)
    .default(PAYMENT_EXPIRATION_MINUTES.DEFAULT),
  active: z.boolean().default(true),
})

const webhookParamsSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDER_VALUES),
  establishmentId: z.string().uuid(),
})

export class PaymentController {
  constructor(
    private readonly getAccountUseCase: GetPaymentAccountUseCase,
    private readonly upsertAccountUseCase: UpsertPaymentAccountUseCase,
    private readonly handleWebhookUseCase: HandlePaymentWebhookUseCase
  ) {}

  getAccount: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    response.json(await this.getAccountUseCase.execute({ establishmentId: request.user.establishmentId }))
  }

  upsertAccount: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = upsertSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    await this.upsertAccountUseCase.execute({
      establishmentId: request.user.establishmentId,
      userId: request.user.id,
      ...parsed.data,
    })
    response.json(await this.getAccountUseCase.execute({ establishmentId: request.user.establishmentId, provider: parsed.data.provider }))
  }

  // Sem autenticação de usuário: quem prova a origem é a assinatura do provedor.
  webhook: RouteHandler = async (request, response) => {
    const params = webhookParamsSchema.safeParse(request.params)
    if (!params.success) {
      response.error('not_found', 'Unknown payment webhook', 404)
      return
    }
    try {
      const result = await this.handleWebhookUseCase.execute({
        ...params.data,
        webhook: { headers: request.headers, rawBody: request.rawBody },
        now: new Date(),
      })
      response.json({ received: true, duplicate: result.duplicate })
    } catch (error) {
      if (error instanceof PaymentError) {
        response.error(error.code, error.message, error.statusCode)
        return
      }
      throw error
    }
  }
}
