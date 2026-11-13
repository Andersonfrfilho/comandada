/**
 * Tipos de problema que o cliente relata. Os ids são os mesmos do bot
 * (src/shared/constants/IssueConstants.ts na raiz) e do painel.
 */
export const ORDER_ISSUE_CATEGORIES = [
  'atraso',
  'item_errado',
  'item_faltando',
  'qualidade',
  'entrega',
  'cobranca',
  'outro',
] as const

export type OrderIssueCategory = (typeof ORDER_ISSUE_CATEGORIES)[number]

export const ORDER_ISSUE_STATUS = { open: 'open', resolved: 'resolved' } as const

export const ORDER_ISSUE_CHANNEL_WHATSAPP = 'whatsapp'

/** Quantos problemas recentes o relatório devolve para a lista do painel. */
export const ORDER_ISSUE_RECENT_LIMIT = 30
