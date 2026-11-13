import { describe, expect, it } from 'bun:test'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import { RecordOrderPaymentsUseCase } from './RecordOrderPaymentsUseCase'

type Database = NodePgDatabase<typeof schema>

function fakeDatabase(paymentStatus: string, alreadyInCashier: boolean): Database {
  return {
    query: {
      orders: { findFirst: async () => ({ paymentStatus }) },
      cashMovements: { findFirst: async () => (alreadyInCashier ? { id: 'movement-1' } : undefined) },
      orderPayments: {
        findMany: async () => [
          { paymentTypeName: 'dinheiro', amount: '30.00', splitLabel: 'Pessoa 1' },
          { paymentTypeName: 'Cartão de débito', amount: '25.50', splitLabel: 'Pessoa 2' },
        ],
      },
    },
  } as unknown as Database
}

async function run(paymentStatus: string, alreadyInCashier = false) {
  const movements: Array<{ paymentMethod?: string | undefined; amount: number }> = []
  const useCase = new RecordOrderPaymentsUseCase(fakeDatabase(paymentStatus, alreadyInCashier), {
    execute: async (input) => {
      movements.push({ paymentMethod: input.paymentMethod, amount: input.amount })
      return {} as never
    },
  })
  await useCase.execute({ orderId: 'order-1', establishmentId: 'establishment-1' })
  return movements
}

describe('RecordOrderPaymentsUseCase', () => {
  it('lança cada parte do pagamento no caixa com a forma certa', async () => {
    expect(await run('not_required')).toEqual([
      { paymentMethod: 'cash', amount: 30 },
      { paymentMethod: 'card_debit', amount: 25.5 },
    ])
  })

  it('pagamento online já entrou no caixa quando foi aprovado', async () => {
    expect(await run('paid')).toEqual([])
  })

  it('não lança de novo o que a equipe já lançou à mão', async () => {
    expect(await run('not_required', true)).toEqual([])
  })
})
