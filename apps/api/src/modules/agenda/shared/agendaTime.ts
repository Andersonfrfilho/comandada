import { AGENDA_TIMEZONE, AGENDA_UTC_OFFSET } from './agenda.constant'

const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: AGENDA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const LOCAL_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: AGENDA_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** `YYYY-MM-DD` in the restaurant's time zone. */
export function toLocalDate(instant: Date): string {
  return LOCAL_DATE_FORMAT.format(instant)
}

/** `HH:mm` in the restaurant's time zone. */
export function toLocalTime(instant: Date): string {
  return LOCAL_TIME_FORMAT.format(instant)
}

export function fromLocalDateTime(localDate: string, localTime: string): Date {
  return new Date(`${localDate}T${localTime}:00${AGENDA_UTC_OFFSET}`)
}

export function startOfLocalDay(localDate: string): Date {
  return fromLocalDateTime(localDate, '00:00')
}

export function addDays(localDate: string, days: number): string {
  const instant = new Date(`${localDate}T12:00:00${AGENDA_UTC_OFFSET}`)
  instant.setUTCDate(instant.getUTCDate() + days)
  return toLocalDate(instant)
}
