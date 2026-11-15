import { and, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import * as schema from '@/infra/database/schema'
import { AGENDA_TIMEZONE } from '@/modules/agenda/shared/agenda.constant'

/**
 * Faturamento, a mesma regra no Dashboard, nos Relatórios e no Financeiro:
 * pedidos **concluídos** no período (pela hora da conclusão), valor do pedido menos o que já foi
 * devolvido ao cliente. Pedido em aberto ainda não é venda; cancelado não é venda.
 *
 * O período é o dia/mês do restaurante (horário de São Paulo), não o do servidor (UTC), senão o
 * "hoje" vira às 21h.
 */
export const REVENUE_TIMEZONE = AGENDA_TIMEZONE

export const orderRevenueAmount = sql`(${schema.orders.totalAmount} - ${schema.orders.refundedAmount})`

export function revenueOrdersWhere(establishmentId: string, range: DateRange): SQL {
  return and(
    eq(schema.orders.establishmentId, establishmentId),
    eq(schema.orders.status, 'completed'),
    gte(schema.orders.completedAt, range.from),
    lt(schema.orders.completedAt, range.to)
  )!
}

/**
 * Dia do mês da conclusão, no horário do restaurante. O fuso vai como literal (constante nossa, não
 * entrada do usuário): como parâmetro, o Postgres não reconhece o mesmo `$n` no SELECT e no GROUP BY.
 */
export const revenueLocalDay = sql<number>`extract(day from (${schema.orders.completedAt} AT TIME ZONE ${sql.raw(`'${REVENUE_TIMEZONE}'`)}))::integer`

export interface DateRange {
  readonly from: Date
  readonly to: Date
}

function offsetMilliseconds(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'))
  return asUtc - instant.getTime()
}

/** Meia-noite local de uma data do calendário, como instante UTC. `month` vai de 1 a 12 (13 vira janeiro seguinte). */
export function localMidnight(year: number, month: number, day: number, timeZone = REVENUE_TIMEZONE): Date {
  const naive = Date.UTC(year, month - 1, day)
  const firstGuess = naive - offsetMilliseconds(new Date(naive), timeZone)
  // Segunda passada acerta a virada de horário de verão, se o fuso tiver.
  return new Date(naive - offsetMilliseconds(new Date(firstGuess), timeZone))
}

function localCalendarDate(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(instant)
    .split('-')
    .map(Number)
  return { year: year!, month: month!, day: day! }
}

export function localDayRange(instant: Date, timeZone = REVENUE_TIMEZONE): DateRange {
  const { year, month, day } = localCalendarDate(instant, timeZone)
  return { from: localMidnight(year, month, day, timeZone), to: localMidnight(year, month, day + 1, timeZone) }
}

export function localMonthRange(year: number, month: number, timeZone = REVENUE_TIMEZONE): DateRange {
  return { from: localMidnight(year, month, 1, timeZone), to: localMidnight(year, month + 1, 1, timeZone) }
}

export function localYearMonth(instant: Date, timeZone = REVENUE_TIMEZONE): { year: number; month: number } {
  const { year, month } = localCalendarDate(instant, timeZone)
  return { year, month }
}
