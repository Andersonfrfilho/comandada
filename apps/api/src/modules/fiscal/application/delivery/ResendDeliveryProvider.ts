import { Resend } from 'resend'
import {
  buildFiscalDeliveryMessage,
  buildFiscalDeliverySubject,
  type FiscalDeliveryPayload,
  type FiscalDeliveryProvider,
  type FiscalDeliveryResult,
} from './FiscalDeliveryProvider.interface'

const FROM_ADDRESS = process.env.FISCAL_EMAIL_FROM ?? 'notas@no-reply.local'

export class ResendDeliveryProvider implements FiscalDeliveryProvider {
  readonly channel = 'email' as const

  async deliver(payload: FiscalDeliveryPayload): Promise<FiscalDeliveryResult> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' }

    try {
      const resend = new Resend(apiKey)
      const message = buildFiscalDeliveryMessage(payload)
      const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: payload.to,
        subject: buildFiscalDeliverySubject(payload),
        text: message,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Resend send failed' }
    }
  }
}
