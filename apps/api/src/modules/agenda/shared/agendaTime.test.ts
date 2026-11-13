import { describe, expect, it } from 'bun:test'

import { addDays, fromLocalDateTime, toLocalDate, toLocalTime } from './agendaTime'

describe('agendaTime', () => {
  it('reads a UTC instant as São Paulo wall time', () => {
    const instant = new Date('2026-11-14T01:30:00Z')
    expect(toLocalDate(instant)).toBe('2026-11-13')
    expect(toLocalTime(instant)).toBe('22:30')
  })

  it('turns São Paulo wall time into the right instant', () => {
    expect(fromLocalDateTime('2026-11-13', '22:30').toISOString()).toBe('2026-11-14T01:30:00.000Z')
  })

  it('walks calendar days across a month boundary', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  })
})
