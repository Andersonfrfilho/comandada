/** Primeiro nome para a saudação; vazio quando o bot ainda não sabe o nome (o cadastro guarda o número). */
export function firstNameOf(name: string, whatsappNumber: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed === whatsappNumber) return ''
  return trimmed.split(/\s+/)[0] ?? ''
}

/** Número inteiro de uma configuração gravada como número ou texto; o padrão quando falta ou é inválido. */
export function settingNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Math.trunc(Number(value))
  return fallback
}

export function settingText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
