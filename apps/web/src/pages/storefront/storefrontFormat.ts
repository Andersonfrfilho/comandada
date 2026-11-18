// Regras puras do cardápio online (formato, horário, carrinho e status), testadas à parte.

const WEEKDAY_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const
const WEEKDAY_NAMES: Record<string, string> = {
  dom: 'domingo',
  seg: 'segunda',
  ter: 'terça',
  qua: 'quarta',
  qui: 'quinta',
  sex: 'sexta',
  sab: 'sábado',
}

/** "16988881234" → "(16) 98888-1234" enquanto o cliente digita. */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  const split = rest.length > 8 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
}

/** DDD + número com 10 ou 11 dígitos. */
export function isCompletePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return digits.length === 10 || digits.length === 11
}

export function maskCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

function saoPauloClock(now: Date): { time: string; weekdayIndex: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now)
  const valueOf = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    time: `${valueOf('hour')}:${valueOf('minute')}`,
    weekdayIndex: Math.max(0, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(valueOf('weekday'))),
  }
}

/** "18:00" → "18h", "18:30" → "18h30". */
export function formatHour(time: string): string {
  const [hour = '', minute = '00'] = time.split(':')
  return minute === '00' ? `${Number(hour)}h` : `${Number(hour)}h${minute}`
}

export interface HoursInput {
  isOpen: boolean
  openingTime: string
  closingTime: string
  workingDays: string[]
}

/** "Aberto até 23h" ou "Fechado · abre hoje às 18h" / "abre quinta às 18h". */
export function hoursLabel(hours: HoursInput, now: Date): string {
  if (hours.isOpen) return `Aberto até ${formatHour(hours.closingTime)}`
  const { time, weekdayIndex } = saoPauloClock(now)
  const opensLater = hours.workingDays.includes(WEEKDAY_KEYS[weekdayIndex] ?? '') && time < hours.openingTime
  if (opensLater) return `Fechado · abre hoje às ${formatHour(hours.openingTime)}`
  for (let offset = 1; offset <= 7; offset += 1) {
    const key = WEEKDAY_KEYS[(weekdayIndex + offset) % 7] ?? ''
    if (hours.workingDays.includes(key)) {
      const day = offset === 1 ? 'amanhã' : WEEKDAY_NAMES[key] ?? key
      return `Fechado · abre ${day} às ${formatHour(hours.openingTime)}`
    }
  }
  return 'Fechado agora'
}

export interface AddressFields {
  cep: string
  street: string
  number: string
  district: string
  city: string
  complement: string
}

export const EMPTY_ADDRESS: AddressFields = { cep: '', street: '', number: '', district: '', city: '', complement: '' }

export function isAddressComplete(address: AddressFields): boolean {
  return address.street.trim().length >= 3 && address.number.trim().length > 0 && address.district.trim().length > 0
}

/** Endereço numa linha, como o bot grava e o mapa entende: "Rua X, 123 - Centro, Franca/SP". */
export function composeAddress(address: AddressFields, fallbackCity: string | null): string {
  const city = address.city.trim() || fallbackCity?.trim() || ''
  const base = `${address.street.trim()}, ${address.number.trim()} - ${address.district.trim()}`
  return city ? `${base}, ${city}` : base
}

export interface CartLine {
  lineId: string
  productId: string
  name: string
  unitPrice: number
  quantity: number
  notes: string
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

export function cartTotal(lines: CartLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100) / 100
}

/** Mesmo produto com a mesma observação soma; observação diferente é outra linha (como no bot). */
export function addToCart(lines: CartLine[], line: Omit<CartLine, 'lineId'>): CartLine[] {
  const notes = line.notes.trim()
  const existing = lines.find((candidate) => candidate.productId === line.productId && candidate.notes === notes)
  if (existing) {
    return lines.map((candidate) =>
      candidate === existing ? { ...candidate, quantity: Math.min(99, candidate.quantity + line.quantity) } : candidate
    )
  }
  return [...lines, { ...line, notes, lineId: `${line.productId}:${notes}` }]
}

export function changeQuantity(lines: CartLine[], lineId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.lineId !== lineId)
  return lines.map((line) => (line.lineId === lineId ? { ...line, quantity: Math.min(99, quantity) } : line))
}

/** Busca sem acento e sem caixa. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface StatusStep {
  key: string
  label: string
}

/** Linha do tempo do pedido para o cliente, conforme entrega ou retirada. */
export function statusSteps(type: string): StatusStep[] {
  const last = type === 'delivery'
    ? [{ key: 'in_delivery', label: 'Saiu para entrega' }, { key: 'completed', label: 'Entregue' }]
    : [{ key: 'ready', label: 'Pronto para retirar' }, { key: 'completed', label: 'Retirado' }]
  return [{ key: 'received', label: 'Recebido' }, { key: 'in_production', label: 'Em preparo' }, ...last]
}

const STATUS_ORDER: Record<string, number> = {
  received: 0,
  in_production: 1,
  ready: 2,
  in_delivery: 2,
  picked_up: 3,
  completed: 3,
}

/** Índice do passo atual na linha do tempo (pronto conta como "saiu" ainda não na entrega). */
export function currentStepIndex(type: string, status: string): number {
  if (type === 'delivery' && status === 'ready') return 1
  return STATUS_ORDER[status] ?? 0
}

export function isFinalStatus(status: string): boolean {
  return status === 'completed' || status === 'picked_up' || status === 'cancelled'
}

/** Link do WhatsApp do restaurante. */
export function whatsappLink(number: string | null, text?: string): string | null {
  if (!number) return null
  const digits = number.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
