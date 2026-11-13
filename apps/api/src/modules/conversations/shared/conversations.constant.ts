/** Vocabulário das conversas compartilhado entre a borda HTTP e quem envia mensagem de fora do módulo. */

/** Estado inicial do fluxo do bot (o n8n é quem o conduz daqui em diante). */
export const CONVERSATION_START_STATE = 'start'

/** Remetente de toda mensagem disparada por um atendente do painel. */
export const CONVERSATION_AGENT_SENDER = 'agent' as const

/**
 * Template de utilidade para avisar o pedido fora da janela de 24 h. Precisa ser criado e aprovado no
 * WhatsApp Manager com este nome, idioma pt_BR, categoria Utilidade e o corpo:
 *   Oi! Temos novidades sobre o seu pedido *{{1}}*: {{2}} Qualquer dúvida, é só responder esta mensagem. 😊
 * Exemplo: {{1}} = PED-20261113-1234, {{2}} = Ele saiu para entrega e já está a caminho! 🛵
 */
export const ORDER_UPDATE_TEMPLATE = {
  defaultName: 'atualizacao_pedido',
  defaultLanguage: 'pt_BR',
  nameSettingKey: 'whatsapp_order_update_template',
  languageSettingKey: 'whatsapp_order_update_template_language',
} as const
