import type { PaymentMethod } from '@/shared/types'

export interface SummarizableMovement {
  readonly type: string
  readonly paymentMethod: string | null
  readonly amount: string
}

export interface PaymentMethodTotal {
  /** `null` quando o lançamento não tem forma (lançamento antigo ou forma desconhecida). */
  readonly method: PaymentMethod | null
  readonly received: string
  readonly refunded: string
  readonly net: string
}

export interface CashRegisterSummary {
  readonly totalIn: string
  readonly totalOut: string
  /** Movimento do turno em todas as formas (abertura + entradas - saídas). Não é o que está na gaveta. */
  readonly balance: string
  /** Dinheiro que deve estar na gaveta: abertura + vendas em dinheiro + suprimentos - sangrias - devoluções em dinheiro. */
  readonly expectedCash: string
  readonly supplies: string
  readonly withdrawals: string
  readonly byMethod: PaymentMethodTotal[]
}

const CASH_METHOD = 'cash'

function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100)
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Pix, cartão e vale não passam pela gaveta: entram no total do turno e na conferência por forma,
 * mas não no dinheiro esperado. Sangria e suprimento são sempre em dinheiro.
 */
export function summarizeCashRegister(
  openingAmount: string,
  movements: readonly SummarizableMovement[]
): CashRegisterSummary {
  let totalInCents = 0
  let totalOutCents = 0
  let suppliesCents = 0
  let withdrawalsCents = 0
  let cashCents = toCents(openingAmount)
  const byMethod = new Map<string | null, { received: number; refunded: number }>()

  for (const movement of movements) {
    const cents = toCents(movement.amount)
    const isCash = movement.paymentMethod === CASH_METHOD

    if (movement.type === 'supply') {
      totalInCents += cents
      suppliesCents += cents
      cashCents += cents
      continue
    }
    if (movement.type === 'withdrawal') {
      totalOutCents += cents
      withdrawalsCents += cents
      cashCents -= cents
      continue
    }
    if (movement.type !== 'payment' && movement.type !== 'refund') continue

    const methodTotals = byMethod.get(movement.paymentMethod) ?? { received: 0, refunded: 0 }
    if (movement.type === 'payment') {
      totalInCents += cents
      methodTotals.received += cents
      if (isCash) cashCents += cents
    } else {
      totalOutCents += cents
      methodTotals.refunded += cents
      if (isCash) cashCents -= cents
    }
    byMethod.set(movement.paymentMethod, methodTotals)
  }

  return {
    totalIn: fromCents(totalInCents),
    totalOut: fromCents(totalOutCents),
    balance: fromCents(toCents(openingAmount) + totalInCents - totalOutCents),
    expectedCash: fromCents(cashCents),
    supplies: fromCents(suppliesCents),
    withdrawals: fromCents(withdrawalsCents),
    byMethod: [...byMethod.entries()]
      .map(([method, totals]) => ({
        method: method as PaymentMethod | null,
        received: fromCents(totals.received),
        refunded: fromCents(totals.refunded),
        net: fromCents(totals.received - totals.refunded),
      }))
      .sort((first, second) => toCents(second.net) - toCents(first.net)),
  }
}
