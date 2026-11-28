import { describe, expect, it } from 'bun:test'

import { createStockEnabledResolver } from './stockEnabled'

function buildResolver(options: { explicit: boolean | undefined; hasRows: boolean }) {
  return createStockEnabledResolver({
    readExplicitSetting: async () => options.explicit,
    hasLegacyStockRows: async () => options.hasRows,
  })
}

describe('createStockEnabledResolver', () => {
  it('liga para quem já tem lote ou movimento', async () => {
    expect(await buildResolver({ explicit: undefined, hasRows: true })('company')).toBe(true)
  })

  it('desliga para quem nunca usou estoque', async () => {
    expect(await buildResolver({ explicit: undefined, hasRows: false })('company')).toBe(false)
  })

  it('a configuração explícita vence o padrão, nos dois sentidos', async () => {
    expect(await buildResolver({ explicit: false, hasRows: true })('company')).toBe(false)
    expect(await buildResolver({ explicit: true, hasRows: false })('company')).toBe(true)
  })
})
