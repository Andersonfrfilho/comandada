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

const KNOWN_FIELDS: ReadonlyArray<{ key: string; label: string; icon: string }> = [
  { key: 'name', label: 'Nome', icon: '👤' },
  { key: 'address', label: 'Endereço', icon: '📍' },
  { key: 'complement', label: 'Complemento', icon: '🏠' },
  { key: 'deliveryType', label: 'Entrega', icon: '🛵' },
  { key: 'paymentType', label: 'Pagamento', icon: '💳' },
  { key: 'change', label: 'Troco', icon: '💵' },
]

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

  const known = KNOWN_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    icon: field.icon,
    value: asDisplayValue(source[field.key]),
  }))

  const cart = { key: CART_KEY, label: 'Pedido em andamento', icon: '🧾', value: cartSummary(source[CART_KEY]) }

  // Só aparece quando existe: depois de confirmar, o bot zera o carrinho e é aqui que o pedido fica.
  const lastOrderValue = asDisplayValue(source[LAST_ORDER_KEY])
  const lastOrder = lastOrderValue ? [{ key: LAST_ORDER_KEY, label: 'Último pedido', icon: '🔖', value: lastOrderValue }] : []

  const extra = Object.keys(source)
    .filter((key) => !handled.has(key))
    .map((key) => ({ key, label: key, icon: '•', value: asDisplayValue(source[key]) }))

  return [...known, cart, ...lastOrder, ...extra]
}
