/**
 * Tradução do contexto da sessão para o painel de contexto do SDK. As chaves (`awaiting_address`,
 * `cart`, `paymentType`) são do fluxo do bot em `src/handlers/` — o pacote não sabe, nem deve
 * saber, o que significam, então a nomeação mora aqui.
 */

import type { ConversationContextEntry } from '@adatechnology/conversations-ui'

const CURRENT_STATE_KEY = 'currentState'
const CART_KEY = 'cart'
const LAST_ORDER_KEY = 'lastOrder'

// Estados de `src/shared/constants/StateConstants.ts` (BotState), que o bot grava em `bot_sessions`.
const STATE_LABELS: Record<string, string> = {
  start: 'Início',
  awaiting_name: 'Aguardando nome',
  ordering: 'Vendo cardápio',
  ordering_cat: 'Vendo cardápio',
  browsing_categories: 'Vendo cardápio',
  ordering_items: 'Montando pedido',
  browsing_items: 'Montando pedido',
  awaiting_size: 'Escolhendo tamanho',
  awaiting_qty: 'Aguardando quantidade',
  awaiting_item_note: 'Anotando observação do item',
  awaiting_more: 'Perguntando se quer mais',
  awaiting_cart_edit: 'Editando carrinho',
  awaiting_cart_edit_item: 'Editando carrinho',
  awaiting_cart_edit_qty: 'Editando carrinho',
  awaiting_text_order_choice: 'Conferindo pedido escrito',
  awaiting_text_order_confirm: 'Conferindo pedido escrito',
  confirming: 'Revisando pedido',
  awaiting_when: 'Escolhendo quando',
  awaiting_schedule_day: 'Agendando (dia)',
  awaiting_schedule_time: 'Agendando (horário)',
  awaiting_type: 'Escolhendo entrega/retirada',
  awaiting_address: 'Aguardando endereço',
  awaiting_address_number: 'Aguardando número do endereço',
  awaiting_complement: 'Aguardando complemento',
  offer_pickup: 'Oferecendo retirada',
  awaiting_payment: 'Aguardando forma de pagamento',
  awaiting_change: 'Aguardando troco',
  awaiting_split_count: 'Dividindo conta',
  awaiting_split_payment: 'Dividindo conta',
  awaiting_split_change: 'Dividindo conta',
  awaiting_mixed_method: 'Pagamento misto',
  awaiting_mixed_amount: 'Pagamento misto',
  awaiting_mixed_change: 'Pagamento misto',
  repeat_order: 'Repetindo último pedido',
  reserving: 'Fazendo reserva',
  confirming_reservation: 'Confirmando reserva',
  human_handoff: 'Transferido para atendente',
  awaiting_order_detail: 'Vendo detalhes do pedido',
  notifications_menu: 'Notificações',
  awaiting_marketing_opt_in: 'Preferência de novidades',
  awaiting_help_option: 'Pedindo ajuda',
  awaiting_issue_followup: 'Relatando problema',
  awaiting_issue_detail: 'Relatando problema',
}

type FieldKey = 'name' | 'address' | 'complement' | 'deliveryType' | 'paymentType' | 'change'

const KNOWN_FIELDS: ReadonlyArray<{ key: FieldKey; label: string; icon: string }> = [
  { key: 'name', label: 'Nome', icon: '👤' },
  { key: 'address', label: 'Endereço', icon: '📍' },
  { key: 'complement', label: 'Complemento', icon: '🏠' },
  { key: 'deliveryType', label: 'Entrega', icon: '🛵' },
  { key: 'paymentType', label: 'Pagamento', icon: '💳' },
  { key: 'change', label: 'Troco', icon: '💵' },
]

/**
 * Passos do bot em que o campo é a pergunta da vez: aí ele aparece "a coletar" mesmo vazio.
 * Fora deles, campo vazio some — troco no cartão, complemento na retirada ou endereço sem pedido
 * nenhum não são pendências, e contavam como "a coletar" no resumo.
 */
const ASKED_IN_STATES: Readonly<Partial<Record<FieldKey, ReadonlyArray<string>>>> = {
  name: ['awaiting_name'],
  address: ['awaiting_address', 'awaiting_address_number'],
  complement: ['awaiting_complement'],
  deliveryType: ['awaiting_type', 'offer_pickup'],
  paymentType: [
    'awaiting_payment',
    'awaiting_split_count',
    'awaiting_split_payment',
    'awaiting_mixed_method',
    'awaiting_mixed_amount',
  ],
  change: ['awaiting_change', 'awaiting_split_change', 'awaiting_mixed_change'],
}

/** Campos que todo pedido em andamento ainda vai pedir: aparecem pendentes enquanto há carrinho. */
const REQUIRED_WHILE_ORDERING: ReadonlySet<FieldKey> = new Set(['deliveryType', 'paymentType'])

interface CartItem {
  name?: string
  quantity?: number
  price?: number
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function stateLabel(currentState: string | undefined): string | undefined {
  if (!currentState) return undefined
  return STATE_LABELS[currentState] ?? currentState
}

function asDisplayValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Itens do carrinho em uma linha só — o painel é uma faixa, não uma tabela. */
function cartSummary(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined

  const items = value as CartItem[]
  const total = items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0)
  const description = items.map((item) => `${item.quantity ?? 1}x ${item.name ?? 'Item'}`).join(', ')

  return total > 0 ? `${description} — ${currencyFormatter.format(total)}` : description
}

export function toContextEntries(context: Record<string, unknown> | undefined): ConversationContextEntry[] {
  const source = context ?? {}
  const handled = new Set([CURRENT_STATE_KEY, CART_KEY, LAST_ORDER_KEY, ...KNOWN_FIELDS.map((field) => field.key)])
  const currentState = typeof source[CURRENT_STATE_KEY] === 'string' ? source[CURRENT_STATE_KEY] : 'start'
  const cartValue = cartSummary(source[CART_KEY])
  const isOrdering = cartValue !== undefined

  const known = KNOWN_FIELDS.flatMap((field) => {
    const value = asDisplayValue(source[field.key])
    const isAsked = ASKED_IN_STATES[field.key]?.includes(currentState) ?? false
    const isPending = isAsked || (isOrdering && REQUIRED_WHILE_ORDERING.has(field.key))
    // Nome fica sempre: é o primeiro dado que o atendente procura.
    if (!value && !isPending && field.key !== 'name') return []
    return [{ key: field.key, label: field.label, icon: field.icon, value }]
  })

  // Carrinho vazio no início (pedido já confirmado ou nem começado) não é pendência.
  const cart =
    isOrdering || currentState !== 'start'
      ? [{ key: CART_KEY, label: 'Pedido em andamento', icon: '🛒', value: cartValue }]
      : []

  // Depois de confirmar, o bot zera o carrinho e é aqui que o pedido fica.
  const lastOrderValue = asDisplayValue(source[LAST_ORDER_KEY])
  const lastOrder = lastOrderValue ? [{ key: LAST_ORDER_KEY, label: 'Último pedido', icon: '🧾', value: lastOrderValue }] : []

  // Chave que o painel ainda não conhece só entra preenchida: vazia viraria pendência sem sentido.
  const extra = Object.keys(source)
    .filter((key) => !handled.has(key))
    .flatMap((key) => {
      const value = asDisplayValue(source[key])
      return value ? [{ key, label: key, icon: '•', value }] : []
    })

  return [...known, ...cart, ...lastOrder, ...extra]
}
