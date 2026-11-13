/**
 * O driver do Postgres entrega `numeric` e o resultado de `AVG`/`SUM` como
 * string — as anotações `sql<number>` do Drizzle não convertem nada em runtime.
 * Chamar `.toFixed()` direto no valor quebra, e `?? 0` não protege porque a
 * string não é nula.
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function toFixedNumber(value: unknown, digits = 1): string {
  return toNumber(value).toFixed(digits)
}
