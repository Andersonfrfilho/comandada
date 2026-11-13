/**
 * Mensagem do bot ao cliente que não nasce de uma conversa (webhook de pagamento, por exemplo):
 * sai como `bot`, sem atendente por trás.
 */
import type { OutsideWindowTemplate } from './OutsideWindowTemplate'

export type SendBotTextParams = {
  readonly establishmentId: string
  readonly whatsappNumber: string
  readonly body: string
  /** Aviso de pedido: vai como template quando a janela de 24 h fechou. */
  readonly outsideWindow?: OutsideWindowTemplate | undefined
}

export interface BotMessageProvider {
  sendText(params: SendBotTextParams): Promise<void>
}
