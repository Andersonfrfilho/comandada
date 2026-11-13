import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { createFiscalPublicToken } from '../FiscalPublicToken'
import type {
  FiscalDeliveryPayload,
  FiscalDeliveryProvider,
} from '../delivery/FiscalDeliveryProvider.interface'

type Database = NodePgDatabase<typeof schema>

type DeliverParams = {
  readonly fiscalDocumentId: string
}

type EmailProviders = {
  readonly resend: FiscalDeliveryProvider
  readonly smtp: FiscalDeliveryProvider
}

const WEB_PUBLIC_URL = process.env.WEB_PUBLIC_URL ?? 'http://localhost:4000'

// Sends the authorized note to the customer over every channel we have contact for. Never throws:
// delivery failure is recorded on the document (retryable) and must not fail the emission flow.
export class DeliverFiscalDocumentUseCase {
  constructor(
    private readonly database: Database,
    private readonly whatsappProvider: FiscalDeliveryProvider,
    private readonly emailProviders: EmailProviders
  ) {}

  async execute(params: DeliverParams): Promise<void> {
    const document = await this.database.query.fiscalDocuments.findFirst({
      where: eq(schema.fiscalDocuments.id, params.fiscalDocumentId),
    })
    if (!document || document.status !== 'authorized') return

    try {
      const order = await this.database.query.orders.findFirst({
        where: eq(schema.orders.id, document.orderId),
      })
      const customer = order?.customerId
        ? await this.database.query.customers.findFirst({ where: eq(schema.customers.id, order.customerId) })
        : undefined

      const config = await this.database.query.fiscalConfigurations.findFirst({
        where: eq(schema.fiscalConfigurations.establishmentId, document.establishmentId),
      })

      const payloadBase = {
        customerName: customer?.name,
        publicUrl: `${WEB_PUBLIC_URL}/nota/${createFiscalPublicToken(document.id)}`,
        numeroDocumento: document.numeroDocumento,
        chaveAcesso: document.chaveAcesso,
        pdfUrl: document.danfePdfUrl ?? undefined,
        establishmentId: document.establishmentId,
        orderCode: order ? (order.code ?? order.id.slice(0, 8).toUpperCase()) : undefined,
      }

      const errors: string[] = []
      let attempted = 0
      let delivered = 0

      // Cliente do WhatsApp tem o número da conversa; cadastro manual pode ter só o telefone.
      const whatsappTo = customer?.whatsappNumber || customer?.phone
      if (whatsappTo) {
        attempted++
        const result = await this.whatsappProvider.deliver({ ...payloadBase, to: whatsappTo })
        if (result.ok) delivered++
        else if (result.error) errors.push(`whatsapp: ${result.error}`)
      }

      if (customer?.email) {
        attempted++
        const emailProvider = config?.emailProvider === 'smtp' ? this.emailProviders.smtp : this.emailProviders.resend
        const result = await emailProvider.deliver({ ...payloadBase, to: customer.email })
        if (result.ok) delivered++
        else if (result.error) errors.push(`email: ${result.error}`)
      }

      await this.database
        .update(schema.fiscalDocuments)
        .set({
          deliveryStatus: this.resolveStatus(attempted, delivered),
          deliveredAt: delivered > 0 ? new Date() : null,
          deliveryError: errors.length > 0 ? errors.join('; ') : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalDocuments.id, document.id))
    } catch (error) {
      // Delivery must never break the job; record the failure so it stays visible and retryable.
      const message = error instanceof Error ? error.message : 'Delivery failed'
      await this.database
        .update(schema.fiscalDocuments)
        .set({ deliveryStatus: 'failed', deliveryError: message, updatedAt: new Date() })
        .where(eq(schema.fiscalDocuments.id, document.id))
        .catch((updateError) => console.error('[Fiscal] failed to record delivery failure', updateError))
    }
  }

  private resolveStatus(attempted: number, delivered: number): 'sent' | 'partial' | 'failed' {
    if (attempted === 0) return 'failed'
    if (delivered === attempted) return 'sent'
    if (delivered > 0) return 'partial'
    return 'failed'
  }
}

export type { FiscalDeliveryPayload }
