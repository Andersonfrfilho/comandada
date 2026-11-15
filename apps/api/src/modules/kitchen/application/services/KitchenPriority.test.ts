import { describe, expect, it } from 'bun:test'
import { computeKitchenPriority, rankKitchenOrders, urgencyFor, type KitchenPriorityOrder } from './KitchenPriority'

const NOW = new Date('2026-11-15T20:00:00Z').getTime()
const at = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000)

const profile = {
  productMinutes: new Map([
    ['temaki', 10],
    ['combo', 30],
    ['refri', 1],
  ]),
  defaultPreparationMinutes: 20,
  deliveryMinutes: 15,
}

function order(overrides: Partial<KitchenPriorityOrder> & { id: string }): KitchenPriorityOrder {
  return {
    type: 'table',
    status: 'received',
    receivedAt: at(0),
    scheduledFor: null,
    estimatedAt: null,
    productionStartedAt: null,
    releasedAt: at(0).getTime(),
    items: [{ productId: 'temaki', readyAt: null }],
    ...overrides,
  }
}

describe('computeKitchenPriority', () => {
  it('entrega desconta o tempo de rua da previsão dada ao cliente', () => {
    const priority = computeKitchenPriority(
      order({ id: 'd', type: 'delivery', estimatedAt: at(50), items: [{ productId: 'combo', readyAt: null }] }),
      profile,
      NOW
    )
    // Cliente recebe às +50; moto leva 15 → pronto às +35; combo leva 30 → começar às +5.
    expect(priority.deadlineSource).toBe('promised')
    expect(priority.routeMinutes).toBe(15)
    expect(priority.readyBy).toBe(at(35).toISOString())
    expect(priority.startBy).toBe(at(5).toISOString())
    expect(priority.slackMinutes).toBe(5)
    expect(priority.urgency).toBe('now')
  })

  it('mesa sem previsão: item rápido ganha folga até o tempo padrão da casa', () => {
    // Chegou há 3 min, padrão 20 → pronto às +17; temaki 10 → começar às +7.
    const priority = computeKitchenPriority(order({ id: 't', receivedAt: at(-3) }), profile, NOW)
    expect(priority.slackMinutes).toBe(7)
    expect(priority.urgency).toBe('soon')
  })

  it('mesa sem previsão com item mais demorado que o padrão já está na hora', () => {
    const priority = computeKitchenPriority(
      order({ id: 't', receivedAt: at(-3), items: [{ productId: 'combo', readyAt: null }] }),
      profile,
      NOW
    )
    expect(priority.deadlineSource).toBe('estimated')
    expect(priority.routeMinutes).toBe(0)
    expect(priority.slackMinutes).toBe(-3)
    expect(priority.urgency).toBe('late')
  })

  it('encomenda usa a hora marcada', () => {
    const priority = computeKitchenPriority(
      order({ id: 's', type: 'pickup', scheduledFor: at(40), estimatedAt: at(40) }),
      profile,
      NOW
    )
    expect(priority.deadlineSource).toBe('scheduled')
    expect(priority.startBy).toBe(at(30).toISOString())
    expect(priority.urgency).toBe('ok')
  })

  it('o item mais demorado ainda não pronto manda; produto sem tempo usa o padrão', () => {
    const priority = computeKitchenPriority(
      order({
        id: 'm',
        estimatedAt: at(60),
        items: [
          { productId: 'combo', readyAt: at(-1) },
          { productId: 'refri', readyAt: null },
          { productId: 'desconhecido', readyAt: null },
        ],
      }),
      profile,
      NOW
    )
    expect(priority.preparationMinutes).toBe(20)
  })

  it('em preparo conta só o que falta', () => {
    const priority = computeKitchenPriority(
      order({
        id: 'p',
        status: 'in_production',
        productionStartedAt: at(-20),
        estimatedAt: at(15),
        items: [{ productId: 'combo', readyAt: null }],
      }),
      profile,
      NOW
    )
    expect(priority.preparationMinutes).toBe(10)
    expect(priority.slackMinutes).toBe(5)
  })
})

describe('urgencyFor', () => {
  it('separa atrasado, agora, em breve e com folga', () => {
    expect([urgencyFor(-1), urgencyFor(0), urgencyFor(5), urgencyFor(6), urgencyFor(15), urgencyFor(16)]).toEqual([
      'late',
      'now',
      'now',
      'soon',
      'soon',
      'ok',
    ])
  })
})

describe('rankKitchenOrders', () => {
  it('entrega que chegou depois passa na frente da mesa quando a moto precisa sair antes', () => {
    const ranked = rankKitchenOrders(
      [
        // Mesa chegou há 2 min, padrão 20, temaki 10: começar até +8.
        order({ id: 'mesa', receivedAt: at(-2), releasedAt: at(-2).getTime() }),
        // Delivery agora, previsão +45, rua 15, combo 30: começar até +0.
        order({ id: 'entrega', type: 'delivery', estimatedAt: at(45), items: [{ productId: 'combo', readyAt: null }] }),
        // Retirada com folga.
        order({ id: 'retirada', type: 'pickup', estimatedAt: at(60), releasedAt: at(-10).getTime() }),
      ],
      profile,
      NOW
    )
    expect(ranked.map((entry) => entry.id)).toEqual(['entrega', 'mesa', 'retirada'])
    expect(ranked.map((entry) => entry.priority.position)).toEqual([1, 2, 3])
    expect(ranked.map((entry) => entry.priority.doNow)).toEqual([true, false, false])
  })

  it('o primeiro aguardando sempre ganha "Fazer agora", e todo pedido sem folga também', () => {
    const ranked = rankKitchenOrders(
      [
        order({ id: 'folga', estimatedAt: at(120) }),
        order({ id: 'atrasado', receivedAt: at(-30), releasedAt: at(-30).getTime() }),
        order({ id: 'atrasado-2', receivedAt: at(-20), releasedAt: at(-20).getTime() }),
      ],
      profile,
      NOW
    )
    expect(ranked.map((entry) => [entry.id, entry.priority.doNow])).toEqual([
      ['atrasado', true],
      ['atrasado-2', true],
      ['folga', false],
    ])
  })

  it('pedidos em preparo vêm antes e não recebem posição nem selo', () => {
    const ranked = rankKitchenOrders(
      [
        order({ id: 'novo', receivedAt: at(-30), releasedAt: at(-30).getTime() }),
        order({ id: 'bancada', status: 'in_production', productionStartedAt: at(-5), estimatedAt: at(30) }),
      ],
      profile,
      NOW
    )
    expect(ranked[0]?.id).toBe('bancada')
    expect(ranked[0]?.priority).toMatchObject({ position: null, doNow: false })
    expect(ranked[1]?.priority).toMatchObject({ position: 1, doNow: true })
  })

  it('empate na hora de começar: quem espera há mais tempo vem antes', () => {
    const ranked = rankKitchenOrders(
      [
        order({ id: 'recente', estimatedAt: at(30), releasedAt: at(-1).getTime() }),
        order({ id: 'antigo', estimatedAt: at(30), releasedAt: at(-9).getTime() }),
      ],
      profile,
      NOW
    )
    expect(ranked.map((entry) => entry.id)).toEqual(['antigo', 'recente'])
  })
})
