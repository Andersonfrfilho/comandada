import { useQuery } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'
import { stockSdkApi } from '@/lib/stockSdkApi'
import { useAuthStore } from '@/stores/authStore'

const STOCK_DISABLED_CODE = 'STOCK_DISABLED'
export const STOCK_ENABLED_QUERY_KEY = ['sdk-stock-enabled'] as const

type StockEnabledState = {
  readonly isLoading: boolean
  readonly isEnabled: boolean
}

/**
 * Nenhuma rota diz se o estoque está ligado: o módulo responde 404 `STOCK_DISABLED` a toda rota de
 * estoque quando a empresa não o usa. Uma listagem de uma linha é a sonda; qualquer outro erro
 * (rede, permissão) não conta como "desligado".
 */
export function useStockEnabled(): StockEnabledState {
  const hasSession = useAuthStore((state) => state.accessToken !== null)

  const { data, isLoading } = useQuery({
    queryKey: STOCK_ENABLED_QUERY_KEY,
    enabled: hasSession,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      try {
        await stockSdkApi.listLevels({ page: 1, pageSize: 1 })
        return true
      } catch (error) {
        if (error instanceof ApiError && error.code === STOCK_DISABLED_CODE) return false
        throw error
      }
    },
  })

  return { isLoading: hasSession && isLoading, isEnabled: data === true }
}
