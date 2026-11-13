import { createTransport } from 'nodemailer'
import {
  buildFiscalDeliveryMessage,
  buildFiscalDeliverySubject,
  type FiscalDeliveryPayload,
  type FiscalDeliveryProvider,
  type FiscalDeliveryResult,
} from './FiscalDeliveryProvider.interface'

const FROM_ADDRESS = process.env.FISCAL_EMAIL_FROM ?? 'notas@no-reply.local'

export class SmtpDeliveryProvider implements FiscalDeliveryProvider {
  readonly channel = 'email' as const

  async deliver(payload: FiscalDeliveryPayload): Promise<FiscalDeliveryResult> {
    const smtpUrl = process.env.SMTP_URL
    if (!smtpUrl) return { ok: false, error: 'SMTP_URL not configured' }

    try {
      const transport = createTransport(smtpUrl)
      await transport.sendMail({
        from: FROM_ADDRESS,
        to: payload.to,
        subject: buildFiscalDeliverySubject(payload),
        text: buildFiscalDeliveryMessage(payload),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'SMTP send failed' }
    }
  }
}
