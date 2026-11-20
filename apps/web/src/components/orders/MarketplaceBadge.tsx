import { isMarketplaceChannel, marketplaceLabel } from '@/lib/orderLabel'

// Cores das marcas para a equipe bater o olho e saber de onde veio (e quem vem buscar).
const BADGE_CLASSES: Record<string, string> = {
  ifood: 'bg-red-600 text-white',
  '99food': 'bg-yellow-400 text-gray-900',
}

interface MarketplaceBadgeProps {
  order: { channel: string; code?: string | null }
  className?: string
}

/** Selo "iFood #8312" / "99Food #4421" nos pedidos que vieram de marketplace; nada nos outros. */
export function MarketplaceBadge({ order, className = '' }: MarketplaceBadgeProps) {
  const label = marketplaceLabel(order)
  if (!label || !isMarketplaceChannel(order.channel)) return null
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold normal-case tracking-normal ${BADGE_CLASSES[order.channel]} ${className}`}
    >
      {label}
    </span>
  )
}
