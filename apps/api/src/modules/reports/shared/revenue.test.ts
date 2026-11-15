import { describe, expect, it } from 'bun:test'
import { localDayRange, localMidnight, localMonthRange, localYearMonth } from './revenue'

describe('dia e mês do restaurante (São Paulo)', () => {
  it('meia-noite local é 03:00 UTC', () => {
    expect(localMidnight(2026, 11, 15).toISOString()).toBe('2026-11-15T03:00:00.000Z')
  })

  it('22h em São Paulo ainda é o mesmo dia, embora já seja o dia seguinte em UTC', () => {
    const lateNight = new Date('2026-11-16T01:00:00.000Z')
    const range = localDayRange(lateNight)
    expect(range.from.toISOString()).toBe('2026-11-15T03:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-11-16T03:00:00.000Z')
  })

  it('o mês vira no fim de dezembro', () => {
    const range = localMonthRange(2026, 12)
    expect(range.from.toISOString()).toBe('2026-12-01T03:00:00.000Z')
    expect(range.to.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })

  it('o mês local de 1º de dezembro 01:00 UTC ainda é novembro', () => {
    expect(localYearMonth(new Date('2026-12-01T01:00:00.000Z'))).toEqual({ year: 2026, month: 11 })
  })
})
