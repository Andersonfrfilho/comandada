import { describe, expect, it } from 'bun:test'

import { GetBotContextUseCase, type BotSharedContext } from './GetBotContextUseCase'
import type { BotCustomerService } from '../services/BotCustomerService'
import type { BotConfigRepository } from '@/infra/database/BotConfigRepository'
import { BOT_SHARED_CONTEXT_CACHE_PREFIX } from '../../shared/bot.constant'

const ESTABLISHMENT_ID = '11111111-1111-4111-8111-111111111111'

const SHARED: BotSharedContext = {
  establishment: { id: ESTABLISHMENT_ID, name: 'Yuyaki', whatsappNumber: '5511999999999', settings: {} },
  config: { opening_time: '18:00' },
  products: [
    { id: 'p1', name: 'Temaki', price: 37, description: null, category: 'Temakis', variant_group: null, variant_label: null },
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

function buildUseCase(cacheValues: Map<string, string>, ttlSeconds: number) {
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
    { cache, ttlSeconds }
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
    expect(context.config).toEqual(SHARED.config)
    expect(context.establishment).toMatchObject({ id: ESTABLISHMENT_ID, name: 'Yuyaki', lat: -23.5, lng: -46.6 })
    expect(context.session).toEqual({})
  })

  it('com TTL 0 nem olha o Redis', async () => {
    const values = new Map([[`${BOT_SHARED_CONTEXT_CACHE_PREFIX}default`, JSON.stringify(SHARED)]])
    const { useCase, reads } = buildUseCase(values, 0)

    // Sem cache ele vai ao banco, que aqui não tem estabelecimentos: o erro prova que o Redis foi ignorado.
    await expect(useCase.execute({ whatsappNumber: '5511988887777' })).rejects.toThrow()
    expect(reads).toEqual([])
  })
})
