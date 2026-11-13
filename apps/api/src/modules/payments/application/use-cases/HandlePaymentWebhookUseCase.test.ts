import { describe, expect, it } from 'bun:test'
import {
  createMercadoPagoPaymentProvider,
  MERCADOPAGO_REQUEST_ID_HEADER,
  MERCADOPAGO_SIGNATURE_HEADER,
  signMercadoPagoWebhook,
} from '@adatechnology/mercadopago-payment-provider'
import { PaymentProviderNotConfiguredError, PaymentWebhookUnauthorizedError } from '@adatechnology/payment-contracts'

import * as schema from '@/infra/database/schema'
import { HandlePaymentWebhookUseCase } from './HandlePaymentWebhookUseCase'
import { ExpireStaleChargesUseCase } from './ExpireStaleChargesUseCase'
import { OrderPaymentTransitions } from '../services/OrderPaymentTransitions'

const ESTABLISHMENT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '44444444-4444-4444-8444-444444444444'
const SECRET = 'segredo-do-webhook'
const NOW = new Date('2026-11-13T13:10:00Z')

type MercadoPagoPayment = { status: string; payment_method_id?: string; payment_type_id?: string }

function buildHarness(options: { paymentStatus?: string; orderStatus?: string; payment?: MercadoPagoPayment; accountActive?: boolean } = {}) {
  const order = {
    id: ORDER_ID,
    establishmentId: ESTABLISHMENT_ID,
    code: 'PED-42',
    channel: 'whatsapp',
    type: 'delivery',
    status: options.orderStatus ?? 'received',
    paymentStatus: options.paymentStatus ?? 'awaiting',
    totalAmount: '50.40',
    scheduleBookingId: null as string | null,
    customer: { whatsappNumber: '5516991112233' },
  }
  const charge = {
    id: 'charge-1',
    establishmentId: ESTABLISHMENT_ID,
    orderId: ORDER_ID,
    provider: 'mercadopago',
    kind: 'pix',
    providerChargeId: '123456789',
    status: 'pending',
    expiresAt: new Date('2026-11-13T12:00:00Z'),
  }
  const seenEvents = new Set<string>()
  const chargeUpdates: Array<Record<string, unknown>> = []
  const database = {
    query: {
      orders: { findFirst: async () => order },
      paymentCharges: { findMany: async () => [charge] },
    },
    insert: () => ({
      values: (row: { eventId: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (seenEvents.has(row.eventId)) return []
            seenEvents.add(row.eventId)
            return [{ id: row.eventId }]
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === schema.orders) Object.assign(order, values)
          if (table === schema.paymentCharges) {
            chargeUpdates.push(values)
            Object.assign(charge, values)
          }
        },
      }),
    }),
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => [{ charge }] }) }) }),
  }
  const apiCalls: string[] = []
  const fakeFetch = async (url: string, init?: RequestInit) => {
    apiCalls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`)
    if ((init?.method ?? 'GET') === 'PUT') return new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 })
    const payment = {
      id: 123456789,
      status: 'approved',
      payment_method_id: 'pix',
      payment_type_id: 'bank_transfer',
      transaction_amount: 50.4,
      currency_id: 'BRL',
      external_reference: ORDER_ID,
      ...options.payment,
    }
    return new Response(JSON.stringify(payment), { status: 200 })
  }
  const account = { id: 'account-1', provider: 'mercadopago', active: options.accountActive ?? true }
  const accounts = {
    findAccount: async () => account as never,
    gatewayFor: () =>
      createMercadoPagoPaymentProvider({ accessToken: 'TEST-token', webhookSecret: SECRET, fetch: fakeFetch }),
  }
  const messages: string[] = []
  const cash: Array<{ amount: number; paymentMethod?: string | undefined }> = []
  const broadcasts: string[] = []
  const transitions = new OrderPaymentTransitions({
    db: database as never,
    wsHub: { publishBroadcast: async (_establishmentId: string, event: string) => { broadcasts.push(event) } } as never,
    botMessages: { sendText: async ({ body }) => { messages.push(body) } },
    addCashMovement: { execute: async (input) => { cash.push(input); return {} as never } },
  })
  const useCase = new HandlePaymentWebhookUseCase(database as never, accounts, transitions)
  const sweep = new ExpireStaleChargesUseCase(database as never, accounts, transitions)
  return { useCase, sweep, order, charge, messages, cash, broadcasts, apiCalls, chargeUpdates }
}

function signedWebhook(secret: string = SECRET) {
  const body = { action: 'payment.updated', type: 'payment', data: { id: '123456789' } }
  return {
    headers: {
      [MERCADOPAGO_SIGNATURE_HEADER]: signMercadoPagoWebhook({ secret, dataId: '123456789', requestId: 'req-1', ts: '1767225600' }),
      [MERCADOPAGO_REQUEST_ID_HEADER]: 'req-1',
    },
    rawBody: Buffer.from(JSON.stringify(body)),
  }
}

describe('HandlePaymentWebhookUseCase', () => {
  it('marks the order paid, records it in the cash register and tells the customer', async () => {
    const harness = buildHarness()
    const result = await harness.useCase.execute({
      establishmentId: ESTABLISHMENT_ID,
      provider: 'mercadopago',
      webhook: signedWebhook(),
      now: NOW,
    })

    expect(result).toEqual({ eventId: '123456789:approved', type: 'payment_approved', duplicate: false, applied: true })
    expect(harness.order.paymentStatus).toBe('paid')
    expect(harness.charge).toMatchObject({ status: 'approved', paidAt: NOW, providerPaymentId: '123456789' })
    expect(harness.cash).toEqual([expect.objectContaining({ amount: 50.4, paymentMethod: 'pix', type: 'payment', orderId: ORDER_ID })])
    expect(harness.broadcasts).toContain('kitchen:order_queued')
    expect(harness.messages[0]).toContain('Pagamento confirmado')
    expect(harness.apiCalls).toEqual(['GET /v1/payments/123456789'])
  })

  it('applies a repeated notification only once', async () => {
    const harness = buildHarness()
    const params = { establishmentId: ESTABLISHMENT_ID, provider: 'mercadopago', webhook: signedWebhook(), now: NOW }
    await harness.useCase.execute(params)
    const second = await harness.useCase.execute(params)

    expect(second.duplicate).toBe(true)
    expect(harness.cash).toHaveLength(1)
    expect(harness.messages).toHaveLength(1)
  })

  it('rejects a webhook with a wrong signature and touches nothing', async () => {
    const harness = buildHarness()
    await expect(
      harness.useCase.execute({ establishmentId: ESTABLISHMENT_ID, provider: 'mercadopago', webhook: signedWebhook('outro'), now: NOW })
    ).rejects.toBeInstanceOf(PaymentWebhookUnauthorizedError)
    expect(harness.order.paymentStatus).toBe('awaiting')
    expect(harness.apiCalls).toHaveLength(0)
  })

  it('refuses webhooks for a restaurant without an active account', async () => {
    const harness = buildHarness({ accountActive: false })
    await expect(
      harness.useCase.execute({ establishmentId: ESTABLISHMENT_ID, provider: 'mercadopago', webhook: signedWebhook(), now: NOW })
    ).rejects.toBeInstanceOf(PaymentProviderNotConfiguredError)
  })

  it('cancels the order when the Pix expires unpaid', async () => {
    const harness = buildHarness({ payment: { status: 'cancelled' } })
    await harness.useCase.execute({ establishmentId: ESTABLISHMENT_ID, provider: 'mercadopago', webhook: signedWebhook(), now: NOW })

    expect(harness.order).toMatchObject({ paymentStatus: 'failed', status: 'cancelled', cancellationReason: 'payment_expired' })
    expect(harness.broadcasts).toContain('order:cancelled')
    expect(harness.messages[0]).toContain('foi cancelado')
    expect(harness.cash).toHaveLength(0)
  })

  it('records card payments as card in the cash register', async () => {
    const harness = buildHarness({ payment: { status: 'approved', payment_method_id: 'visa', payment_type_id: 'credit_card' } })
    await harness.useCase.execute({ establishmentId: ESTABLISHMENT_ID, provider: 'mercadopago', webhook: signedWebhook(), now: NOW })
    expect(harness.cash[0]?.paymentMethod).toBe('card_credit')
  })

  it('marks a refund on a paid order', async () => {
    const harness = buildHarness({ paymentStatus: 'paid', payment: { status: 'refunded' } })
    await harness.useCase.execute({ establishmentId: ESTABLISHMENT_ID, provider: 'mercadopago', webhook: signedWebhook(), now: NOW })
    expect(harness.order.paymentStatus).toBe('refunded')
    expect(harness.messages[0]).toContain('estornado')
  })
})

describe('ExpireStaleChargesUseCase', () => {
  it('cancels the Pix at the provider and then the order', async () => {
    const harness = buildHarness()
    const expired = await harness.sweep.execute({ now: NOW })

    expect(expired).toBe(1)
    expect(harness.apiCalls).toEqual(['PUT /v1/payments/123456789'])
    expect(harness.order).toMatchObject({ paymentStatus: 'failed', status: 'cancelled' })
  })

  it('leaves an already paid order alone', async () => {
    const harness = buildHarness({ paymentStatus: 'paid' })
    expect(await harness.sweep.execute({ now: NOW })).toBe(0)
    expect(harness.order.status).toBe('received')
  })
})
