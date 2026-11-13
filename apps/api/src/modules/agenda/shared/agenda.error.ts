import { AppError } from '@/shared/errors/AppError'

export const AGENDA_ERROR_CODES = {
  SLOT_UNAVAILABLE: 'agenda_slot_unavailable',
  NO_TABLE_AVAILABLE: 'agenda_no_table_available',
  TOO_SOON: 'agenda_too_soon',
} as const

export class AgendaError extends AppError {
  constructor(message: string, code: string, details?: unknown) {
    super(message, code, 409, details)
    this.name = 'AgendaError'
  }
}

export class ScheduleSlotUnavailableError extends AgendaError {
  constructor(localDate: string, localTime: string) {
    super('Schedule slot unavailable', AGENDA_ERROR_CODES.SLOT_UNAVAILABLE, { localDate, localTime })
  }
}

export class NoTableAvailableError extends AgendaError {
  constructor(partySize: number) {
    super('No table available', AGENDA_ERROR_CODES.NO_TABLE_AVAILABLE, { partySize })
  }
}

export class ScheduleTooSoonError extends AgendaError {
  constructor(minimumLeadMinutes: number) {
    super('Schedule too soon', AGENDA_ERROR_CODES.TOO_SOON, { minimumLeadMinutes })
  }
}
