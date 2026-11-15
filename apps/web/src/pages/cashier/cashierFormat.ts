export const HIDDEN_VALUE_PLACEHOLDER = 'R$ ••••••'

export const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix', card_credit: 'Crédito', card_debit: 'Débito', cash: 'Dinheiro', voucher: 'Voucher',
}

export function formatBRL(value: string | number, hidden: boolean): string {
  if (hidden) return HIDDEN_VALUE_PLACEHOLDER
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Campo de dinheiro aceita vírgula ("120,50"). Vazio ou inválido vira `null`. */
export function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  if (normalized === '') return null
  const parsed = Number(value.includes(',') ? normalized : value.trim())
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null
}

/** Contado - esperado, em centavos para não errar o arredondamento. Negativo é falta. */
export function closingDifference(counted: number, expected: string | number): number {
  return (Math.round(counted * 100) - Math.round(Number(expected) * 100)) / 100
}
