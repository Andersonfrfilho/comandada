import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { META_WHATSAPP_ERROR_CODES } from '@adatechnology/meta-whatsapp-contracts'
import * as schema from '@/infra/database/schema'
import type { OutsideWindowTemplate } from '@/shared/providers/OutsideWindowTemplate'
import {
  CONVERSATION_START_STATE,
  ORDER_UPDATE_TEMPLATE,
} from '../../shared/conversations.constant'

type Database = NodePgDatabase<typeof schema>

interface ConversationSender {
  sendText(params: {
    companyId: string
    whatsappNumber: string
    body: string
    sender: 'bot' | 'agent'
    agentUserId?: string
    startState: string
  }): Promise<unknown>
  sendTemplate(params: {
    companyId: string
    whatsappNumber: string
    templateName: string
    languageCode?: string
    bodyParameters?: string[]
    sender: 'bot' | 'agent'
    agentUserId?: string
    startState: string
  }): Promise<unknown>
}

export interface OrderUpdateMessage {
  readonly establishmentId: string
  readonly whatsappNumber: string
  readonly body: string
  readonly sender: 'bot' | 'agent'
  readonly agentUserId?: string | undefined
  readonly outsideWindow?: OutsideWindowTemplate | undefined
}

export function isWindowExpired(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as Error & { code?: unknown }).code
  return code === META_WHATSAPP_ERROR_CODES.WINDOW_EXPIRED || error.constructor.name === 'WindowExpiredError'
}

// Template do WhatsApp sem quebra de linha, tabulação nem 4+ espaços seguidos nos parâmetros.
function templateParameter(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim()
}

/**
 * Envia um aviso de pedido. Dentro da janela de 24 h vai o texto normal; fora dela (encomenda para
 * amanhã, cliente que sumiu) vai o template aprovado de atualização de pedido, com o mesmo conteúdo
 * resumido. Sem template configurado na Meta, o erro da janela segue como antes.
 */
export class OrderUpdateSender {
  constructor(
    private readonly db: Database,
    private readonly conversationsFor: (establishmentId: string) => ConversationSender
  ) {}

  async send(message: OrderUpdateMessage): Promise<void> {
    const conversations = this.conversationsFor(message.establishmentId)
    try {
      await conversations.sendText({
        companyId: message.establishmentId,
        whatsappNumber: message.whatsappNumber,
        body: message.body,
        sender: message.sender,
        ...(message.agentUserId ? { agentUserId: message.agentUserId } : {}),
        startState: CONVERSATION_START_STATE,
      })
    } catch (error) {
      if (!message.outsideWindow || !isWindowExpired(error)) throw error
      const template = await this.templateFor(message.establishmentId)
      if (!template.name) throw error
      await conversations.sendTemplate({
        companyId: message.establishmentId,
        whatsappNumber: message.whatsappNumber,
        templateName: template.name,
        languageCode: template.language,
        bodyParameters: message.outsideWindow.parameters.map(templateParameter),
        sender: message.sender,
        ...(message.agentUserId ? { agentUserId: message.agentUserId } : {}),
        startState: CONVERSATION_START_STATE,
      })
    }
  }

  // Cada restaurante pode usar outro nome de template (Configurações); vazio desliga o envio fora da janela.
  private async templateFor(establishmentId: string): Promise<{ name: string; language: string }> {
    const rows = await this.db.query.settings.findMany({
      where: eq(schema.settings.establishmentId, establishmentId),
    })
    const value = (key: string): string | undefined => {
      const row = rows.find((candidate) => candidate.key === key)
      return row && typeof row.value === 'string' ? row.value : undefined
    }
    return {
      name: value(ORDER_UPDATE_TEMPLATE.nameSettingKey) ?? ORDER_UPDATE_TEMPLATE.defaultName,
      language: value(ORDER_UPDATE_TEMPLATE.languageSettingKey) ?? ORDER_UPDATE_TEMPLATE.defaultLanguage,
    }
  }
}
