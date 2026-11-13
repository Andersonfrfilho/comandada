import { describe, expect, it } from 'bun:test'

import { CreateBotOrderUseCase, type CreateBotOrderParams } from './CreateBotOrderUseCase'
import type { BotCustomerService } from '../services/BotCustomerService'
import { ValidationError } from '@/shared/errors/AppError'

const ESTABLISHMENT_ID = '11111111-1111-4111-8111-111111111111'
const TEMAKI_ID = '22222222-2222-4222-8222-222222222222'
const COMBO_ID = '33333333-3333-4333-8333-333333333333'

const CATALOG = [
  { id: TEMAKI_ID, name: 'Temaki de Salmão (Médio)', price: '37.00', active: true },
  { id: COMBO_ID, name: 'Combo Tradicional', price: '95.00', active: false },
]

type CreatedOrder = { type: string; channel: string; scheduledFor?: string | undefined; items: Array<{ unitPrice: number; quantity: number }>; payments: Array<{ paymentTypeName: string; amount: number; changeFor?: number | undefined; splitLabel?: string | undefined }> }

type ChargeCall = { kind: string; amount: number; orderId: string; orderCode: string }

function buildUseCase(options: { failOrder?: boolean; charges?: ChargeCall[] } = {}): { useCase: CreateBotOrderUseCase; created: CreatedOrder[]; cancelled: string[] } {
  const created: CreatedOrder[] = []
  const cancelled: string[] = []
  const database = {
    query: { products: { findMany: async () => CATALOG } },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }
  const customerService = { findOrCreate: async () => ({ id: 'customer-1' }) } as unknown as BotCustomerService
  const createOrder = {
    execute: async (input: CreatedOrder) => {
      if (options.failOrder) throw new Error('database down')
      created.push(input)
      return { id: 'order-1' }
    },
  }
  const scheduleBooking = {
    book: { execute: async () => ({ bookingId: 'booking-1' }) },
    cancel: { execute: async () => { cancelled.push('booking-1') } },
  }
  const estimate = { execute: async () => ({ estimatedAt: new Date('2026-11-13T22:40:00Z'), minutes: 40 }) }
  const chargeCalls = options.charges
  const orderCharges = chargeCalls
    ? {
        execute: async (input: ChargeCall) => {
          chargeCalls.push(input)
          return { status: 'created' as const, kind: input.kind as 'pix', amount: input.amount, expiresAt: '2026-11-13T23:00:00.000Z', expirationMinutes: 30, pixCopyPaste: '000201PIX' }
        },
      }
    : undefined
  const useCase = new CreateBotOrderUseCase(database as never, customerService, createOrder as never, scheduleBooking, estimate, orderCharges as never)
  return { useCase, created, cancelled }
}

function buildParams(overrides: Partial<CreateBotOrderParams> = {}): CreateBotOrderParams {
  return {
    establishmentId: ESTABLISHMENT_ID,
    whatsappNumber: '5516991112233',
    code: 'PED-1',
    orderType: 'retirada',
    items: [{ productId: TEMAKI_ID, quantity: 3 }],
    paymentMethod: 'pix',
    ...overrides,
  }
}

describe('CreateBotOrderUseCase', () => {
  it('prices items from the catalog and maps the bot vocabulary', async () => {
    const { useCase, created } = buildUseCase()
    const result = await useCase.execute(buildParams())

    expect(result).toEqual({ id: 'order-1', code: 'PED-1', estimatedAt: '2026-11-13T22:40:00.000Z', estimatedMinutes: 40 })
    expect(created[0]?.type).toBe('pickup')
    expect(created[0]?.channel).toBe('whatsapp')
    expect(created[0]?.items[0]?.unitPrice).toBe(37)
    expect(created[0]?.payments).toEqual([{ paymentTypeName: 'pix', amount: 111, changeFor: undefined }])
  })

  it('keeps split legs and gives the rounding remainder to the last person', async () => {
    const { useCase, created } = buildUseCase()
    const legs = [
      { method: 'pix', amount: 12.33, splitLabel: 'Pessoa 1' },
      { method: 'dinheiro', amount: 12.33, changeFor: 20, splitLabel: 'Pessoa 2' },
      { method: 'pix', amount: 12.33, splitLabel: 'Pessoa 3' },
    ]
    await useCase.execute(buildParams({ payments: legs, items: [{ productId: TEMAKI_ID, quantity: 1 }] }))

    expect(created[0]?.payments.map((payment) => payment.amount)).toEqual([12.33, 12.33, 12.34])
    expect(created[0]?.payments[1]).toEqual({ paymentTypeName: 'dinheiro', amount: 12.33, changeFor: 20, splitLabel: 'Pessoa 2' })
  })

  it('records a mixed payment as card part plus cash part with change', async () => {
    const { useCase, created } = buildUseCase()
    const legs = [
      { method: 'cartao', amount: 30 },
      { method: 'dinheiro', amount: 7, changeFor: 10 },
    ]
    await useCase.execute(buildParams({ payments: legs, items: [{ productId: TEMAKI_ID, quantity: 1 }] }))

    expect(created[0]?.payments).toEqual([
      { paymentTypeName: 'cartao', amount: 30, changeFor: undefined, splitLabel: undefined },
      { paymentTypeName: 'dinheiro', amount: 7, changeFor: 10, splitLabel: undefined },
    ])
  })

  it('charges the quoted delivery fee on delivery orders', async () => {
    const { useCase, created } = buildUseCase()
    await useCase.execute(buildParams({ orderType: 'delivery', address: 'Rua A, 1', deliveryFee: 8, paymentMethod: 'dinheiro', changeFor: 50 }))

    expect(created[0]?.payments).toEqual([{ paymentTypeName: 'dinheiro', amount: 119, changeFor: 50 }])
  })

  it('books the slot of an encomenda and releases it when the order fails', async () => {
    const scheduledFor = '2026-11-14T19:30:00-03:00'
    const ok = buildUseCase()
    await ok.useCase.execute(buildParams({ scheduledFor }))
    expect(ok.created[0]?.scheduledFor).toBe('2026-11-14T22:30:00.000Z')

    const failing = buildUseCase({ failOrder: true })
    expect(failing.useCase.execute(buildParams({ scheduledFor }))).rejects.toThrow('database down')
    await Bun.sleep(0)
    expect(failing.cancelled).toEqual(['booking-1'])
  })

  it('refuses inactive products and unknown order types', async () => {
    const { useCase } = buildUseCase()
    expect(useCase.execute(buildParams({ items: [{ productId: COMBO_ID, quantity: 1 }] }))).rejects.toBeInstanceOf(ValidationError)
    expect(useCase.execute(buildParams({ orderType: 'foguete' }))).rejects.toBeInstanceOf(ValidationError)
  })

  it('generates the online charge for a single Pix payment, delivery fee included', async () => {
    const charges: ChargeCall[] = []
    const { useCase } = buildUseCase({ charges })
    const result = await useCase.execute(buildParams({ orderType: 'delivery', deliveryFee: 7.5, address: 'Rua A, 1' }))

    expect(charges).toEqual([
      expect.objectContaining({ kind: 'pix', amount: 118.5, orderId: 'order-1', orderCode: 'PED-1' }),
    ])
    expect(result.payment).toMatchObject({ status: 'created', kind: 'pix', pixCopyPaste: '000201PIX' })
  })

  it('sends the card link when the customer picks card by link', async () => {
    const charges: ChargeCall[] = []
    const { useCase } = buildUseCase({ charges })
    await useCase.execute(buildParams({ paymentMethod: 'link_cartao' }))
    expect(charges[0]?.kind).toBe('payment_link')
  })

  it('keeps cash, card on delivery, split and mixed payments offline', async () => {
    const charges: ChargeCall[] = []
    const { useCase } = buildUseCase({ charges })
    await useCase.execute(buildParams({ paymentMethod: 'dinheiro' }))
    await useCase.execute(buildParams({ paymentMethod: 'cartao' }))
    await useCase.execute(
      buildParams({
        paymentMethod: 'dividido',
        payments: [
          { method: 'pix', amount: 55.5 },
          { method: 'pix', amount: 55.5 },
        ],
      })
    )
    expect(charges).toHaveLength(0)
  })
})
