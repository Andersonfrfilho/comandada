import { describe, expect, it } from 'bun:test'
import { elapsedLabel } from './elapsed'

describe('elapsedLabel', () => {
  const now = new Date('2026-11-15T20:00:00Z')
  it('mostra minutos e horas', () => {
    expect(elapsedLabel('2026-11-15T19:59:40Z', now)).toBe('agora')
    expect(elapsedLabel('2026-11-15T19:35:00Z', now)).toBe('há 25 min')
    expect(elapsedLabel('2026-11-15T18:40:00Z', now)).toBe('há 1 h 20 min')
    expect(elapsedLabel('2026-11-15T18:00:00Z', now)).toBe('há 2 h')
  })
})
