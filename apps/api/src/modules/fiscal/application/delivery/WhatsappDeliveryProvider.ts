import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import {
  buildFiscalWhatsappMessage,
  buildFiscalWhatsappTemplateText,
  type FiscalDeliveryPayload,
  type FiscalDeliveryProvider,
  type FiscalDeliveryResult,
} from './FiscalDeliveryProvider.interface'

// Cupom pelo mesmo WhatsApp do restaurante (módulo de conversas), na conversa que o cliente já tem
// com o bot. Fora da janela de 24 h sai como template de atualização do pedido.
export class WhatsappDeliveryProvider implements FiscalDeliveryProvider {
  readonly channel = 'whatsapp' as const

  constructor(private readonly botMessages: BotMessageProvider) {}

  async deliver(payload: FiscalDeliveryPayload): Promise<FiscalDeliveryResult> {
    if (!payload.establishmentId) return { ok: false, error: 'establishment missing' }
    try {
      await this.botMessages.sendText({
        establishmentId: payload.establishmentId,
        whatsappNumber: payload.to,
        body: buildFiscalWhatsappMessage(payload),
        outsideWindow: payload.orderCode
          ? { parameters: [payload.orderCode, buildFiscalWhatsappTemplateText(payload)] }
          : undefined,
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'WhatsApp send failed' }
    }
  }
}
