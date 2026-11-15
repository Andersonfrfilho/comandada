import { describe, expect, it } from 'bun:test'
import { hasPermission } from '@/lib/permissions'
import { homePathFor, visibleSectionsFor } from './navigation'

const CASHIER = [
  { resource: 'cashier', action: 'read' },
  { resource: 'cashier', action: 'write' },
  { resource: 'orders', action: 'read' },
]

describe('navigation', () => {
  it('lista de permissões: qualquer uma basta', () => {
    const rule = [{ resource: 'orders', action: 'write' }, { resource: 'cashier', action: 'write' }] as const
    expect(hasPermission(CASHIER, rule)).toBe(true)
    expect(hasPermission([{ resource: 'kitchen', action: 'read' }], rule)).toBe(false)
  })

  it('caixa vê Mesas para receber a conta, mas abre no Caixa', () => {
    const labels = visibleSectionsFor(CASHIER).flatMap((section) => section.items.map((item) => item.label))
    expect(labels).toContain('Mesas')
    expect(homePathFor(CASHIER)).toBe('/cashier')
  })
})
