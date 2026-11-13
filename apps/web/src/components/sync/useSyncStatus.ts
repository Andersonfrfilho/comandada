import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

export interface SyncStatus {
  readonly enabled: boolean
  readonly role?: 'loja' | 'nuvem'
  readonly nodeId?: string
  readonly online?: boolean
  readonly lastSuccessAt?: string | null
  readonly lastAttemptAt?: string | null
  readonly lastError?: string | null
  readonly pendingPush?: number
  readonly conflicts?: { readonly open: number; readonly retrying: number }
}

const REFRESH_INTERVAL_MS = 10_000

export function useSyncStatus() {
  const accessToken = useAuthStore((state) => state.accessToken)
  return useQuery({
    queryKey: ['sync', 'status'],
    queryFn: () => api.get<SyncStatus>('/sync/status', accessToken ?? undefined),
    refetchInterval: REFRESH_INTERVAL_MS,
    // Em servidor antigo (sem a rota) o indicador simplesmente não aparece.
    retry: false,
    enabled: Boolean(accessToken),
  })
}
