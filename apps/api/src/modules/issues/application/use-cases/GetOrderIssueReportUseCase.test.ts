import { describe, expect, it } from 'bun:test'
import { issueRatePercent } from './GetOrderIssueReportUseCase'

describe('issueRatePercent', () => {
  it('é a fração de pedidos com problema, com uma casa', () => {
    expect(issueRatePercent(3, 40)).toBe('7.5')
  })

  it('sem pedidos no período não divide por zero', () => {
    expect(issueRatePercent(0, 0)).toBe('0.0')
  })
})
