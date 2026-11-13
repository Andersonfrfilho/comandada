// Brasil não tem horário de verão desde 2019: o fuso local é fixo em -03:00.
export const AGENDA_TIMEZONE = 'America/Sao_Paulo'
export const AGENDA_UTC_OFFSET = '-03:00'

export const SCHEDULED_ORDER_SERVICE_NAME = 'Encomenda'
export const SCHEDULED_ORDER_DURATION_MINUTES = 15
// How many scheduled orders the kitchen takes in the same 15-minute slot.
export const PRODUCTION_LINE_COUNT = 3
export const PRODUCTION_LINE_REF_PREFIX = 'production-line:'

export const TABLE_RESERVATION_SERVICE_NAME = 'Reserva de mesa'
export const TABLE_RESERVATION_DURATION_MINUTES = 120
export const TABLE_REF_PREFIX = 'table:'

// A scheduled order needs at least this much notice; earlier than that it is an order "for now".
export const SCHEDULE_MIN_LEAD_MINUTES = 60
export const SCHEDULE_LOOKAHEAD_DAYS = 3

export const DEFAULT_OPENING_TIME = '18:00'
export const DEFAULT_CLOSING_TIME = '23:00'
export const DEFAULT_WORKING_DAYS = 'ter,qua,qui,sex,sab,dom'
export const WEEKDAY_BY_ABBREVIATION: Readonly<Record<string, number>> = {
  dom: 0,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
}

export const SCHEDULING_ACTOR_BOT = 'whatsapp-bot'
