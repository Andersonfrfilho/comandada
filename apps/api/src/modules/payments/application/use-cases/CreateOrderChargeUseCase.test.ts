import { describe, expect, it } from 'bun:test'
import type { Charge, CreateChargeParams } from '@adatechnology/payment-contracts'

import * as schema from '@/infra/database/schema'
import { CreateOrderChargeUseCase } from './CreateOrderChargeUseCase'

const ESTABLISHMENT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-11-13T13:00:00Z')

function buildHarness(options: { pixEnabled?: boolean; noAccount?: boolean; fail?: boolean; expirationMinutes?: number } = {}) {
  const requests: CreateChargeParams[] = []
  const inserted: Array<Record<string, unknown>> = []
  const orderUpdates: Array<Record<string, unknown>> = []
  const gateway = {
    chargeKinds: ['pix', 'payment_link'],
    createCharge: async (params: CreateChargeParams): Promise<Charge> => {
      requests.push(params)
      if (options.fail) throw new Error('mercado pago fora')
      return {
        provider: 'mercadopago',
        id: '987',
        kind: params.kind,
        status: 'pending',
        amount: params.amount,
        reference: params.reference,
        expiresAt: params.expiresAt,
        pix: { copyPaste: '000201PIX', qrCodeBase64: null, ticketUrl: 'https://mp/ticket' },
        paymentMethod: 'pix',
      }
    },
  }
  const account = {
    provider: 'mercadopago',
    pixEnabled: options.pixEnabled ?? true,
    cardLinkEnabled: true,
    expirationMinutes: options.expirationMinutes ?? 30,
  }
  const accounts = {
    resolveActive: async () => (options.noAccount ? undefined : ({ account, gateway } as never)),
  }
  const database = {
    insert: () => ({ values: async (row: Record<string, unknown>) => { inserted.push(row) } }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === schema.orders) orderUpdates.push(values)
        },
      }),
    }),
  }
  const useCase = new CreateOrderChargeUseCase(database as never, accounts, 'https://api.restaurante.com/')
  return { useCase, requests, inserted, orderUpdates }
}

const PARAMS = { establishmentId: ESTABLISHMENT_ID, orderId: ORDER_ID, orderCode: 'PED-42', kind: 'pix' as const, amount: 57.9, now: NOW }

describe('CreateOrderChargeUseCase', () => {
  it('creates the Pix on the restaurant account and holds the order until it is paid', async () => {
    const harness = buildHarness()
    const result = await harness.useCase.execute(PARAMS)

    expect(result).toMatchObject({ status: 'created', kind: 'pix', pixCopyPaste: '000201PIX', expirationMinutes: 30 })
    expect(harness.requests[0]).toMatchObject({
      amount: { cents: 5790, currency: 'BRL' },
      reference: ORDER_ID,
      idempotencyKey: `order-${ORDER_ID}-pix`,
      notificationUrl: `https://api.restaurante.com/webhooks/payments/mercadopago/${ESTABLISHMENT_ID}`,
      expiresAt: new Date('2026-11-13T13:30:00Z'),
    })
    expect(harness.inserted[0]).toMatchObject({ orderId: ORDER_ID, providerChargeId: '987', amount: '57.90', pixCopyPaste: '000201PIX' })
    expect(harness.orderUpdates).toEqual([{ paymentStatus: 'awaiting' }])
  })

  it('does nothing without an account or with Pix turned off', async () => {
    expect(await buildHarness({ noAccount: true }).useCase.execute(PARAMS)).toBeUndefined()
    const disabled = buildHarness({ pixEnabled: false })
    expect(await disabled.useCase.execute(PARAMS)).toBeUndefined()
    expect(disabled.requests).toHaveLength(0)
  })

  it('keeps the order going when the provider fails', async () => {
    const harness = buildHarness({ fail: true })
    expect(await harness.useCase.execute(PARAMS)).toEqual({ status: 'unavailable', kind: 'pix' })
    expect(harness.orderUpdates).toHaveLength(0)
  })

  it('never lets the code expire in less than 30 minutes', async () => {
    const harness = buildHarness({ expirationMinutes: 5 })
    await harness.useCase.execute(PARAMS)
    expect(harness.requests[0]?.expiresAt).toEqual(new Date('2026-11-13T13:30:00Z'))
  })
})
