import { useQuery } from '@tanstack/react-query'

import { useStockEnabled } from '@/hooks/useStockEnabled'
import { countExpiringBatches, stockSdkApi } from '@/lib/stockSdkApi'

// Mesma janela do aviso de validade da API quando o restaurante não ajustou a dele.
const EXPIRY_ALERT_DAYS = 7
const REFRESH_INTERVAL_MS = 300_000

type StockAlertCounts = {
  readonly belowMinimumCount: number
  readonly expiringBatchCount: number
}

export function useStockAlertCounts(): StockAlertCounts {
  const { isEnabled } = useStockEnabled()

  const belowMinimumQuery = useQuery({
    queryKey: ['sdk-stock-below-minimum-count'],
    enabled: isEnabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: async () => (await stockSdkApi.listLevels({ page: 1, pageSize: 1, belowMinimum: true })).pagination.total,
  })
  const expiringQuery = useQuery({
    queryKey: ['sdk-stock-expiring-count', EXPIRY_ALERT_DAYS],
    enabled: isEnabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: () => countExpiringBatches(EXPIRY_ALERT_DAYS),
  })

  return { belowMinimumCount: belowMinimumQuery.data ?? 0, expiringBatchCount: expiringQuery.data ?? 0 }
}
