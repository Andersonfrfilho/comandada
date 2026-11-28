import { AlertTriangle, TrendingDown } from 'lucide-react'

import { useStockAlertCounts } from '@/hooks/useStockAlertCounts'

type StockAlertBadgesProps = {
  readonly className?: string
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

export function StockAlertBadges({ className = '' }: StockAlertBadgesProps) {
  const { belowMinimumCount, expiringBatchCount } = useStockAlertCounts()
  if (belowMinimumCount === 0 && expiringBatchCount === 0) return null

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {belowMinimumCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
          <TrendingDown className="h-3 w-3" aria-hidden="true" />
          {belowMinimumCount} {pluralize(belowMinimumCount, 'insumo abaixo do mínimo', 'insumos abaixo do mínimo')}
        </span>
      )}
      {expiringBatchCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {expiringBatchCount} {pluralize(expiringBatchCount, 'lote vencendo', 'lotes vencendo')}
        </span>
      )}
    </span>
  )
}
