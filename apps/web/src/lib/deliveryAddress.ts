export type AddressSnapshot = Record<string, string | null | undefined>

/**
 * Endereço da entrega numa linha. Pedidos novos (painel e WhatsApp) gravam tudo em `address`; os
 * antigos guardavam rua, número, bairro e cidade separados, e o detalhe do pedido mostrava vazio
 * (mapa cinza, rota sem destino).
 */
export function formatDeliveryAddress(snapshot: AddressSnapshot | null | undefined): string {
  if (!snapshot) return ''
  const single = snapshot['address']
  if (single) return single
  const streetLine = [snapshot['street'], snapshot['number']].filter(Boolean).join(', ')
  const cityLine = [snapshot['city'], snapshot['state']].filter(Boolean).join(' - ')
  return [streetLine, snapshot['neighborhood'], cityLine].filter(Boolean).join(' · ')
}

export function deliveryComplement(snapshot: AddressSnapshot | null | undefined): string | null {
  return snapshot?.['complement'] || null
}
