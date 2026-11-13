import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { ROLES } from '@/constants/navigation'
import { SYNC_LABELS, SYNC_TABLE_LABELS } from '@/constants/syncLabels'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { SyncStatus } from './useSyncStatus'

interface SyncConflict {
  readonly id: string
  readonly tableName: string
  readonly pk: string
  readonly reason: string
  readonly status: 'open' | 'retry'
  readonly attempts: number
  readonly createdAt: string
}

interface SyncDetailsModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly status: SyncStatus
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return SYNC_LABELS.never
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

export function SyncDetailsModal({ open, onClose, status }: SyncDetailsModalProps) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const role = useAuthStore((state) => state.user?.role)
  const canResolve = role === ROLES.ADMIN || role === ROLES.MANAGER
  const queryClient = useQueryClient()

  const { data: conflicts } = useQuery({
    queryKey: ['sync', 'conflicts'],
    queryFn: () => api.get<{ data: SyncConflict[] }>('/sync/conflicts', accessToken),
    enabled: open && canResolve,
  })

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'discard' }) =>
      api.post(`/sync/conflicts/${id}/${action}`, {}, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sync'] })
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={SYNC_LABELS.title} size="lg">
      <div className="p-5">
        <p className="text-sm text-gray-600">{SYNC_LABELS.explanation}</p>

        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">{SYNC_LABELS.cloud}</dt>
            <dd className="font-medium text-gray-900">{status.online ? SYNC_LABELS.online : SYNC_LABELS.offline}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{SYNC_LABELS.lastSuccess}</dt>
            <dd className="font-medium text-gray-900">{formatDateTime(status.lastSuccessAt)}</dd>
          </div>
          {(status.pendingPush ?? 0) > 0 && (
            <div className="sm:col-span-2 font-medium text-amber-700">
              {SYNC_LABELS.pending(status.pendingPush ?? 0)}
            </div>
          )}
          {status.lastError && !status.online && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">{SYNC_LABELS.lastError}</dt>
              <dd className="break-words text-gray-700">{status.lastError}</dd>
            </div>
          )}
        </dl>

        {canResolve && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900">{SYNC_LABELS.conflictsTitle}</h3>
            {!conflicts?.data.length ? (
              <p className="mt-2 text-sm text-gray-500">{SYNC_LABELS.noConflicts}</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                {conflicts.data.map((conflict) => (
                  <li
                    key={conflict.id}
                    className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">
                        {SYNC_TABLE_LABELS[conflict.tableName] ?? conflict.tableName}{' '}
                        <span className="font-mono text-xs text-gray-500">{conflict.pk.slice(-8)}</span>
                      </p>
                      <p className="break-words text-gray-600">{conflict.reason}</p>
                      {conflict.status === 'retry' && <p className="text-xs text-gray-400">{SYNC_LABELS.retrying}</p>}
                    </div>
                    {conflict.status === 'open' && (
                      <div className="flex flex-shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={resolve.isPending}
                          onClick={() =>
                            resolve.mutate({
                              id: conflict.id,
                              action: 'discard',
                            })
                          }
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {SYNC_LABELS.keepLocal}
                        </button>
                        <button
                          type="button"
                          disabled={resolve.isPending}
                          onClick={() =>
                            resolve.mutate({
                              id: conflict.id,
                              action: 'accept',
                            })
                          }
                          className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700"
                        >
                          {SYNC_LABELS.acceptRemote}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
