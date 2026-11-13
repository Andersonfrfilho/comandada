const RESTAURANT_TIME_ZONE = 'America/Sao_Paulo'

export function todayIsoDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RESTAURANT_TIME_ZONE }).format(new Date())
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days, 12)).toISOString().slice(0, 10)
}

export function formatAgendaDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const noon = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12))
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(noon)
}
