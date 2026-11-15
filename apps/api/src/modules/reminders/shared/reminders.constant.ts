import type { WhatsAppTemplateSetting } from '@/shared/providers/OutsideWindowTemplate'

/**
 * Lembrete "faz X dias que você pediu" (workflow 04). Só vai para quem aceitou novidades no bot.
 * Configurações do restaurante (tabela `settings`, valor número ou texto):
 *   reminder_interval_days    dias desde o último pedido; 0 desliga. Padrão 15.
 *   reminder_min_gap_days     intervalo mínimo entre dois lembretes ao mesmo cliente. Padrão 7.
 *   reminder_send_hour        hora local (0-23) em que o lembrete sai. Padrão 11.
 *   reminder_message_template texto dentro da janela de 24 h; aceita {name}, {days}, {last_item}, {establishment}.
 */
export const REORDER_REMINDER_SETTINGS = {
  intervalDaysKey: 'reminder_interval_days',
  minGapDaysKey: 'reminder_min_gap_days',
  sendHourKey: 'reminder_send_hour',
  messageTemplateKey: 'reminder_message_template',
} as const

export const REORDER_REMINDER_DEFAULTS = {
  intervalDays: 15,
  minGapDays: 7,
  sendHour: 11,
  batchLimit: 200,
} as const

export const REORDER_REMINDER_DEFAULT_MESSAGE =
  'Oi, *{name}*! 👋 Tudo bem?\n\nFaz *{days} dias* que você pediu _{last_item}_ e a gente já está com saudade! 🥹\n\nQue tal matar a vontade hoje? É só responder *oi* que eu monto seu pedido rapidinho 😋'

/**
 * Template de marketing para o lembrete fora da janela de 24 h (quase sempre: o último pedido foi há dias).
 * Criar no WhatsApp Manager com este nome, idioma pt_BR, categoria Marketing e o corpo:
 *   Oi, {{1}}! Faz {{2}} dias que você pediu {{3}} e a gente já está com saudade. Que tal pedir de novo hoje? É só responder esta mensagem. 😋
 * Exemplo: {{1}} = Ana, {{2}} = 15, {{3}} = Temaki Salmão
 */
export const REORDER_REMINDER_TEMPLATE: WhatsAppTemplateSetting = {
  defaultName: 'lembrete_pedido',
  defaultLanguage: 'pt_BR',
  nameSettingKey: 'whatsapp_reorder_reminder_template',
  languageSettingKey: 'whatsapp_reorder_reminder_template_language',
}

/**
 * Lembrete de reserva de mesa (workflow 05). A agenda (scheduling SDK) marca como devida toda reserva
 * confirmada que começa nas próximas 24 h e chama o hook uma vez por reserva.
 *
 * Template de utilidade para fora da janela de 24 h. Criar no WhatsApp Manager com este nome, idioma
 * pt_BR, categoria Utilidade e o corpo:
 *   Oi, {{1}}! Passando para lembrar da sua reserva {{2}}: mesa para {{3}} pessoas {{4}}. Se não puder vir, é só responder esta mensagem. 😊
 * Exemplo: {{1}} = Ana, {{2}} = RES-1234, {{3}} = 4, {{4}} = amanhã às 20:00
 */
export const RESERVATION_REMINDER_TEMPLATE: WhatsAppTemplateSetting = {
  defaultName: 'lembrete_reserva',
  defaultLanguage: 'pt_BR',
  nameSettingKey: 'whatsapp_reservation_reminder_template',
  languageSettingKey: 'whatsapp_reservation_reminder_template_language',
}

/** Reserva feita há menos que isto já tem a confirmação fresca na conversa: não precisa de lembrete. */
export const RESERVATION_REMINDER_MIN_AGE_MINUTES = 120
