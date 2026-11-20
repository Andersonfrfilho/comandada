import { describe, expect, it } from 'bun:test'
import { salesCsv, salesTotals, timeLeftLabel, type MarketplaceSale } from './marketplaces'

const sale: MarketplaceSale = {
  platform: 'ifood',
  merchantId: 'm1',
  externalOrderId: 'abc',
  displayId: '8312',
  date: '2026-11-01T12:00:00Z',
  status: 'CONCLUDED',
  grossAmount: 68.98,
  entries: [{ label: 'Comissão', amount: -7.2 }],
  netAmount: 52.1,
}

describe('marketplaces', () => {
  it('soma bruto, ajustes e líquido', () => {
    expect(salesTotals([sale, { ...sale, grossAmount: 10, netAmount: 8 }])).toEqual({ gross: 78.98, net: 60.1, adjustments: -18.88, count: 2 })
  })

  it('planilha com vírgula decimal e ponto e vírgula', () => {
    const csv = salesCsv([sale])
    expect(csv.split('\n')[1]).toBe('iFood;m1;8312;2026-11-01T12:00:00Z;CONCLUDED;;68,98;-16,88;52,10;;Comissão: -7,20')
  })

  it('tempo restante até o prazo', () => {
    const now = Date.parse('2026-11-20T12:00:00Z')
    expect(timeLeftLabel('2026-11-20T12:04:12Z', now)).toBe('4 min 12 s')
    expect(timeLeftLabel('2026-11-20T11:59:00Z', now)).toBeNull()
    expect(timeLeftLabel('2026-11-21T13:30:00Z', now)).toBe('25 h 30 min')
  })
})
