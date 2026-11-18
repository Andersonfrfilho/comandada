import { describe, expect, it } from 'bun:test'
import { META_WHATSAPP_ERROR_CODES } from '@adatechnology/meta-whatsapp-contracts'
import type { BotSharedContext } from '@/modules/bot/application/use-cases/GetBotContextUseCase'
import type { SendBotTextParams } from '@/shared/providers/BotMessageProvider'
import { StorefrontAccountService, type StorefrontAccountRepository } from './StorefrontAccountService'
import type { StorefrontCustomer } from './StorefrontService'
import { createSessionToken, readSessionToken, SESSION_TTL_SECONDS } from '../shared/storefrontSession'

const ESTABLISHMENT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ESTABLISHMENT_ID = '99999999-9999-4999-8999-999999999999'
const SECRET = 'segredo-de-teste'
const NOW = new Date('2026-11-18T23:00:00Z')

const context = {
  establishment: { id: ESTABLISHMENT_ID, name: 'Yuyaki', whatsappNumber: '5516999990000', settings: { brand_name: 'Yuyaki Sushi Bar' } },
  config: {},
  paymentTypes: [{ id: 1, name: 'pix', type: 'digital', label: 'PIX', config: {} }],
} as unknown as BotSharedContext

class MemoryCache {
  values = new Map<string, string>()
  async get(key: string) {
    return this.values.get(key) ?? null
  }
  async set(key: string, value: string) {
    this.values.set(key, value)
  }
  async delete(key: string) {
    this.values.delete(key)
  }
  async increment(key: string) {
    const next = Number(this.values.get(key) ?? '0') + 1
    this.values.set(key, String(next))
    return next
  }
  async expire() {}
  async ttl() {
    return 300
  }
}

function build(options: { customer?: StorefrontCustomer | null; sendError?: Error } = {}) {
  const sent: SendBotTextParams[] = []
  const cache = new MemoryCache()
  const repository: StorefrontAccountRepository = {
    findCustomerByPhones: async () => options.customer ?? null,
    deliveryAddresses: async () => ['Rua A, 10 - Centro (apto 3)'],
    lastPaymentMethod: async () => 'pix',
    recentOrders: async () => [
      {
        id: 'o1',
        number: 128,
        createdAt: new Date('2026-11-14T22:00:00Z'),
        totalAmount: 149,
        type: 'delivery',
        items: [
          { productId: 'p1', name: 'Combo Executivo', quantity: 1, notes: null },
          { productId: null, name: 'Item apagado', quantity: 1, notes: null },
        ],
      },
    ],
  }
  const service = new StorefrontAccountService(
    repository,
    { establishmentContext: async () => context },
    {
      sendText: async (params) => {
        if (options.sendError) throw options.sendError
        sent.push(params)
      },
    },
    cache,
    SECRET,
    () => NOW
  )
  return { service, sent, cache }
}

function codeFrom(body: string): string {
  return body.match(/\*(\d{6})\*/)?.[1] ?? ''
}

describe('StorefrontAccountService', () => {
  it('manda o código pelo WhatsApp e entra com ele', async () => {
    const { service, sent } = build({ customer: { id: 'c1', name: 'Anderson', whatsappNumber: '5516981234567' } })
    const request = await service.requestCode({ establishmentId: ESTABLISHMENT_ID, phone: '(16) 98123-4567' })
    expect(request.sentTo).toBe('(16) 98123-4567')
    expect(sent).toHaveLength(1)
    expect(sent[0]?.whatsappNumber).toBe('5516981234567')
    expect(sent[0]?.body).toContain('Yuyaki Sushi Bar')

    const result = await service.verifyCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567', code: codeFrom(sent[0]?.body ?? '') })
    expect(result.account.name).toBe('Anderson')
    expect(result.account.addresses).toEqual(['Rua A, 10 - Centro (apto 3)'])
    expect(result.account.lastPaymentMethod).toBe('pix')
    // Item sem produto (apagado do cardápio) não entra no "repetir".
    expect(result.account.recentOrders[0]?.items.map((item) => item.productId)).toEqual(['p1'])

    const account = await service.account({ establishmentId: ESTABLISHMENT_ID, token: result.token })
    expect(account.phone).toBe('5516981234567')
  })

  it('código usado não vale de novo', async () => {
    const { service, sent } = build()
    await service.requestCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567' })
    const code = codeFrom(sent[0]?.body ?? '')
    await service.verifyCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567', code })
    await expect(service.verifyCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567', code })).rejects.toThrow('venceu')
  })

  it('código errado conta tentativa e trava depois do limite', async () => {
    const { service, sent } = build()
    await service.requestCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567' })
    const right = codeFrom(sent[0]?.body ?? '')
    const wrong = right === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.verifyCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567', code: wrong })).rejects.toThrow('Código errado')
    }
    await expect(service.verifyCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567', code: right })).rejects.toThrow('Muitas tentativas')
  })

  it('limita os envios para o mesmo número', async () => {
    const { service } = build()
    for (let send = 0; send < 3; send += 1) await service.requestCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567' })
    await expect(service.requestCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567' })).rejects.toThrow()
  })

  it('janela do WhatsApp fechada vira um pedido de "oi"', async () => {
    const windowError = Object.assign(new Error('window'), { code: META_WHATSAPP_ERROR_CODES.WINDOW_EXPIRED })
    const { service, cache } = build({ sendError: windowError })
    await expect(service.requestCode({ establishmentId: ESTABLISHMENT_ID, phone: '16981234567' })).rejects.toMatchObject({
      code: 'whatsapp_window_closed',
    })
    expect([...cache.values.keys()].some((key) => key.includes('login:code'))).toBe(false)
  })

  it('sessão de outro restaurante ou vencida não abre a conta', async () => {
    const { service } = build()
    const other = createSessionToken({ establishmentId: OTHER_ESTABLISHMENT_ID, phone: '5516981234567', now: NOW }, SECRET)
    await expect(service.account({ establishmentId: ESTABLISHMENT_ID, token: other })).rejects.toThrow('sessão')
    const old = createSessionToken({ establishmentId: ESTABLISHMENT_ID, phone: '5516981234567', now: new Date(NOW.getTime() - (SESSION_TTL_SECONDS + 1) * 1000) }, SECRET)
    expect(readSessionToken(old, ESTABLISHMENT_ID, NOW, SECRET)).toBeNull()
    const tampered = createSessionToken({ establishmentId: ESTABLISHMENT_ID, phone: '5516981234567', now: NOW }, 'outro-segredo')
    await expect(service.account({ establishmentId: ESTABLISHMENT_ID, token: tampered })).rejects.toThrow('sessão')
  })
})
