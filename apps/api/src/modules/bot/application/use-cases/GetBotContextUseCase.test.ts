import { describe, expect, it } from 'bun:test'

import { GetBotContextUseCase, deliveryAddressText, singlePaymentMethod, type BotSharedContext } from './GetBotContextUseCase'
import type { BotCustomerService } from '../services/BotCustomerService'
import type { BotConfigRepository } from '@/infra/database/BotConfigRepository'
import { BOT_SHARED_CONTEXT_CACHE_PREFIX } from '../../shared/bot.constant'

const ESTABLISHMENT_ID = '11111111-1111-4111-8111-111111111111'

const SHARED: BotSharedContext = {
  establishment: { id: ESTABLISHMENT_ID, name: 'Yuyaki', whatsappNumber: '5511999999999', settings: {} },
  config: { opening_time: '18:00' },
  products: [
    { id: 'p1', name: 'Temaki', price: 37, description: null, category: 'Temakis', variant_group: null, variant_label: null, image_version: null },
  ],
  paymentTypes: [],
  orderTypes: [],
  tables: [],
  deliveryFeeRule: null,
  coordinates: { latitude: -23.5, longitude: -46.6 },
}

// Só o que é do cliente vem do banco; cardápio, configurações e estabelecimento não podem ser lidos.
function buildDatabase() {
  return {
    query: { botSessions: { findFirst: async () => undefined } },
    execute: async () => ({ rows: [] }),
  }
}

function buildUseCase(cacheValues: Map<string, string>, ttlSeconds: number, audioOrdersEnabled = false) {
  const reads: string[] = []
  const cache = {
    get: async (key: string) => {
      reads.push(key)
      return cacheValues.get(key) ?? null
    },
    set: async (key: string, value: string) => {
      cacheValues.set(key, value)
    },
  }
  const useCase = new GetBotContextUseCase(
    buildDatabase() as never,
    {} as BotConfigRepository,
    { findByNumber: async () => null } as unknown as BotCustomerService,
    { execute: async () => [] },
    undefined,
    undefined,
    undefined,
    { cache, ttlSeconds },
    audioOrdersEnabled
  )
  return { useCase, reads }
}

describe('GetBotContextUseCase — cache do contexto compartilhado', () => {
  it('usa o cardápio e as configurações do Redis sem consultar o banco', async () => {
    const values = new Map([[`${BOT_SHARED_CONTEXT_CACHE_PREFIX}5511999999999`, JSON.stringify(SHARED)]])
    const { useCase, reads } = buildUseCase(values, 30)

    const context = await useCase.execute({ whatsappNumber: '5511988887777', instance: '5511999999999' })

    expect(reads).toEqual([`${BOT_SHARED_CONTEXT_CACHE_PREFIX}5511999999999`])
    expect(context.products).toEqual(SHARED.products)
    expect(context.config).toEqual({ ...SHARED.config, feature_audio_orders: 'false' })
    expect(context.establishment).toMatchObject({ id: ESTABLISHMENT_ID, name: 'Yuyaki', lat: -23.5, lng: -46.6 })
    expect(context.session).toEqual({})
  })

  it('avisa o bot pela config quando o pedido por áudio está ligado', async () => {
    const values = new Map([[`${BOT_SHARED_CONTEXT_CACHE_PREFIX}5511999999999`, JSON.stringify(SHARED)]])
    const { useCase } = buildUseCase(values, 30, true)

    const context = await useCase.execute({ whatsappNumber: '5511988887777', instance: '5511999999999' })

    expect((context.config as Record<string, string>)['feature_audio_orders']).toBe('true')
  })

  it('com TTL 0 nem olha o Redis', async () => {
    const values = new Map([[`${BOT_SHARED_CONTEXT_CACHE_PREFIX}default`, JSON.stringify(SHARED)]])
    const { useCase, reads } = buildUseCase(values, 0)

    // Sem cache ele vai ao banco, que aqui não tem estabelecimentos: o erro prova que o Redis foi ignorado.
    await expect(useCase.execute({ whatsappNumber: '5511988887777' })).rejects.toThrow()
    expect(reads).toEqual([])
  })
})

describe('deliveryAddressText — endereço da última entrega para o bot', () => {
  it('junta o complemento guardado à parte', () => {
    expect(deliveryAddressText({ address: 'Rua A, 1, Centro', complement: 'apto 12' })).toBe('Rua A, 1, Centro, apto 12')
  })

  it('não repete o complemento que o bot já gravou no endereço', () => {
    expect(deliveryAddressText({ address: 'Rua A, 1, apto 12', complement: 'apto 12' })).toBe('Rua A, 1, apto 12')
  })

  it('snapshot sem endereço vira null', () => {
    expect(deliveryAddressText({ address: '  ' })).toBeNull()
    expect(deliveryAddressText(null)).toBeNull()
  })
})

describe('singlePaymentMethod — pagar igual ao último pedido', () => {
  it('pedido numa parte só devolve a forma', () => {
    expect(singlePaymentMethod(['pix'])).toBe('pix')
  })

  it('divisão ou misto (várias partes) e pedido sem pagamento devolvem null', () => {
    expect(singlePaymentMethod(['pix', 'dinheiro'])).toBeNull()
    expect(singlePaymentMethod([])).toBeNull()
  })
})
