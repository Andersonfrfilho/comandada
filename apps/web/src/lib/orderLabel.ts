interface OrderReference {
  id: string
  number?: number | null
  code?: string | null
}

/**
 * "#123": o mesmo número no painel, na cozinha, nas entregas, nas notas e no WhatsApp do cliente.
 * Sem número (pedido que veio da sincronização da loja), o código do bot ou o começo do id.
 */
export function orderNumberLabel(order: OrderReference): string {
  if (order.number) return `#${order.number}`
  return order.code ?? `#${order.id.slice(0, 8).toUpperCase()}`
}

interface OrderParty {
  type: string
  table?: { number: number } | null
  customer?: { name: string | null } | null
  customerName?: string | null
}

/** Para quem é o pedido: "Mesa 5", o nome do cliente, ou os dois. */
export function orderPartyLabel(order: OrderParty): string | null {
  const name = order.customer?.name ?? order.customerName ?? null
  const table = order.table ? `Mesa ${order.table.number}` : null
  if (table && name) return `${table} · ${name}`
  return table ?? name
}

/** Plataformas de delivery que mandam pedido para o painel. */
export type MarketplaceChannel = 'ifood' | '99food'

const MARKETPLACE_NAMES: Record<MarketplaceChannel, string> = { ifood: 'iFood', '99food': '99Food' }

export function isMarketplaceChannel(channel: string): channel is MarketplaceChannel {
  return channel in MARKETPLACE_NAMES
}

/** "iFood #8312": de onde veio e o número que o entregador da plataforma vai pedir no balcão. */
export function marketplaceLabel(order: { channel: string; code?: string | null }): string | null {
  if (!isMarketplaceChannel(order.channel)) return null
  const name = MARKETPLACE_NAMES[order.channel]
  return order.code ? `${name} #${order.code}` : name
}
