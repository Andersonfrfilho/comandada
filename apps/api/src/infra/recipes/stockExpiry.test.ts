import { describe, expect, it } from 'bun:test'
import type { ExpiringBatch } from '@adatechnology/stock-contracts'

import { DEFAULT_EXPIRY_ALERT_DAYS, MAX_EXPIRY_ALERT_DAYS, readExpiryAlertDays, selectBatchesWithinDays } from './stockExpiry'

const NOW = new Date('2026-11-27T12:00:00.000Z')
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

function batch(id: string, daysFromNow: number | null): ExpiringBatch {
  return {
    id,
    companyId: 'company-1',
    ingredientId: 'ingredient-1',
    ingredientName: 'Farinha',
    batchCode: id,
    unit: 'kg',
    quantity: '1.0000',
    remainingQuantity: '1.0000',
    costPerUnit: null,
    expiresAt: daysFromNow === null ? null : new Date(NOW.getTime() + daysFromNow * DAY_IN_MILLISECONDS).toISOString(),
    receivedAt: NOW.toISOString(),
  }
}

describe('readExpiryAlertDays', () => {
  it('usa o padrão sem configuração válida e limita à janela do módulo', () => {
    expect(readExpiryAlertDays(undefined)).toBe(DEFAULT_EXPIRY_ALERT_DAYS)
    expect(readExpiryAlertDays({ expiry_alert_days: 'x' })).toBe(DEFAULT_EXPIRY_ALERT_DAYS)
    expect(readExpiryAlertDays({ expiry_alert_days: 0 })).toBe(DEFAULT_EXPIRY_ALERT_DAYS)
    expect(readExpiryAlertDays({ expiry_alert_days: 14 })).toBe(14)
    expect(readExpiryAlertDays({ expiry_alert_days: 9999 })).toBe(MAX_EXPIRY_ALERT_DAYS)
  })
})

describe('selectBatchesWithinDays', () => {
  it('mantém o lote que vence na janela do restaurante (inclusive o já vencido) e tira o resto', () => {
    const selected = selectBatchesWithinDays({
      batches: [batch('vencido', -2), batch('perto', 5), batch('limite', 7), batch('longe', 8), batch('sem-validade', null)],
      days: 7,
      now: NOW,
    })

    expect(selected.map((item) => item.id)).toEqual(['vencido', 'perto', 'limite'])
  })
})
