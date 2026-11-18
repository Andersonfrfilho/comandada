import type { PaymentTypeRow } from '@/infra/database/BotConfigRepository'
import { CARD_LINK_PAYMENT_TYPE_NAME } from '@/modules/payments/shared/payments.constant'

export interface StorefrontSourceProduct {
  id: string
  name: string
  price: number
  description: string | null
  category: string
  variant_group: string | null
  variant_label: string | null
}

export interface StorefrontOption {
  productId: string
  /** Tamanho ("Médio"); null quando o item tem um preço só. */
  label: string | null
  price: number
}

export interface StorefrontItem {
  /** Grupo de tamanhos ou o próprio produto: chave estável para o carrinho do navegador. */
  key: string
  name: string
  description: string | null
  options: StorefrontOption[]
}

export interface StorefrontCategory {
  name: string
  items: StorefrontItem[]
}

/**
 * Cardápio do bot (já na ordem certa) em categorias, com os tamanhos do mesmo item juntos num card
 * só ("Temaki salmão": Médio R$ 25 · Grande R$ 32), como a tela do tamanho do bot.
 */
export function groupStorefrontMenu(products: StorefrontSourceProduct[]): StorefrontCategory[] {
  const categories: StorefrontCategory[] = []
  for (const product of products) {
    let category = categories.find((candidate) => candidate.name === product.category)
    if (!category) {
      category = { name: product.category, items: [] }
      categories.push(category)
    }
    const option: StorefrontOption = { productId: product.id, label: product.variant_label?.trim() || null, price: product.price }
    const groupName = product.variant_group?.trim()
    if (groupName) {
      const key = `group:${groupName}`
      const existing = category.items.find((item) => item.key === key)
      if (existing) {
        existing.options.push(option)
        existing.description ??= product.description
        continue
      }
      category.items.push({ key, name: groupName, description: product.description, options: [option] })
      continue
    }
    category.items.push({ key: product.id, name: product.name, description: product.description, options: [option] })
  }
  for (const category of categories) {
    for (const item of category.items) item.options.sort((left, right) => left.price - right.price)
  }
  return categories
}

export type StorefrontPaymentKind = 'cash' | 'card' | 'pix' | 'pix_online' | 'card_link'

export interface StorefrontPaymentMethod {
  name: string
  label: string
  kind: StorefrontPaymentKind
  /** Chave Pix para pagar na hora quando o Pix não é cobrado pela conta do restaurante. */
  pixKey: string | null
  pixHolder: string | null
}

/** Formas de pagamento ativas como o bot oferece (Pix online e cartão pelo link com a conta ligada). */
export function storefrontPaymentMethods(paymentTypes: PaymentTypeRow[]): StorefrontPaymentMethod[] {
  return paymentTypes.map((paymentType) => {
    const config = paymentType.config ?? {}
    const online = config['online'] === 'true'
    const kind: StorefrontPaymentKind =
      paymentType.name === CARD_LINK_PAYMENT_TYPE_NAME
        ? 'card_link'
        : paymentType.name === 'pix'
          ? online ? 'pix_online' : 'pix'
          : paymentType.type === 'cash' || paymentType.name === 'dinheiro'
            ? 'cash'
            : 'card'
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
    return {
      name: paymentType.name,
      label: paymentType.label,
      kind,
      pixKey: kind === 'pix' ? text(config['chave']) : null,
      pixHolder: kind === 'pix' ? text(config['nome']) : null,
    }
  })
}
