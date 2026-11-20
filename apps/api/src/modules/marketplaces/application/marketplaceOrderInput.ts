import { MARKETPLACE_LABELS, type MarketplaceOrder, type MarketplaceOrderItem } from '../domain/Marketplace'

/** Produto do cardápio que pode receber um item da plataforma. */
export interface CatalogProduct {
  id: string
  name: string
  barcode: string | null
}

export interface MarketplaceOrderItemInput {
  productId?: string | undefined
  productName: string
  unitPrice: number
  quantity: number
  notes?: string | undefined
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatMoney(value: number): string {
  return currency.format(value).replace(/ /g, ' ')
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Liga o item da plataforma ao produto do cardápio: primeiro pelo código do PDV cadastrado na
 * plataforma (id do produto ou código de barras), depois pelo nome igual (sem acento e caixa).
 * Sem vínculo o item entra com o nome e o preço da plataforma e a cozinha vê mesmo assim.
 */
export function matchProduct(item: MarketplaceOrderItem, products: CatalogProduct[]): CatalogProduct | undefined {
  const code = item.externalCode?.trim()
  if (code) {
    const byCode = products.find((product) => product.id === code || (product.barcode && product.barcode === code))
    if (byCode) return byCode
  }
  const name = normalizeName(item.name)
  return products.find((product) => normalizeName(product.name) === name)
}

/** Itens do pedido no formato do `CreateOrderUseCase`, com o preço que a plataforma cobrou. */
export function toOrderItems(order: MarketplaceOrder, products: CatalogProduct[]): MarketplaceOrderItemInput[] {
  const label = MARKETPLACE_LABELS[order.platform]
  return order.items.map((item) => {
    const product = matchProduct(item, products)
    const options = item.options.map((option) => `${option.quantity}x ${option.name}`)
    const notes = [
      options.length > 0 ? `+ ${options.join(', ')}` : '',
      item.notes ?? '',
      product ? '' : `[${label}] sem vínculo no cardápio`,
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      ...(product ? { productId: product.id } : {}),
      productName: product?.name ?? item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      ...(notes ? { notes } : {}),
    }
  })
}

/** Observação do pedido: de onde veio, como foi pago, o que cobrar na entrega e o recado do cliente. */
export function buildOrderNotes(order: MarketplaceOrder): string {
  const label = MARKETPLACE_LABELS[order.platform]
  const lines: string[] = [`Pedido ${label} #${order.displayId}`]

  const prepaid = order.payments.filter((payment) => payment.prepaid)
  const pending = order.payments.filter((payment) => !payment.prepaid)
  if (prepaid.length > 0) {
    lines.push(`Pago no ${label}: ${prepaid.map((payment) => `${payment.method} ${formatMoney(payment.amount)}`).join(', ')}`)
  }
  if (pending.length > 0) {
    lines.push(
      `Cobrar na ${order.type === 'delivery' ? 'entrega' : 'retirada'}: ${pending
        .map(
          (payment) =>
            `${payment.method} ${formatMoney(payment.amount)}${payment.changeFor ? ` (troco para ${formatMoney(payment.changeFor)})` : ''}`
        )
        .join(', ')}`
    )
  }
  if (order.discount > 0) lines.push(`Desconto no ${label}: ${formatMoney(order.discount)}`)
  if (order.type === 'delivery') {
    lines.push(order.deliveredBy === 'platform' ? `Entrega pelo ${label}` : 'Entrega própria do restaurante')
  }
  if (order.pickupCode) lines.push(`Código de coleta: ${order.pickupCode}`)
  if (order.customerPhone) lines.push(`Contato do cliente: ${order.customerPhone}`)
  if (order.deliveryAddress?.reference) lines.push(`Referência: ${order.deliveryAddress.reference}`)
  if (order.notes) lines.push(`Obs.: ${order.notes}`)
  return lines.join('\n')
}
