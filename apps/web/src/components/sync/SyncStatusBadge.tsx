import { useState } from 'react'
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { SYNC_LABELS } from '@/constants/syncLabels'
import { SyncDetailsModal } from './SyncDetailsModal'
import { useSyncStatus } from './useSyncStatus'

/**
 * Indicador no menu: verde quando loja e nuvem estão em dia, âmbar quando há alterações esperando
 * ou a internet caiu, vermelho quando há conflito para alguém olhar. Só aparece com sync ligado.
 */
export function SyncStatusBadge() {
  const { data: status } = useSyncStatus()
  const [open, setOpen] = useState(false)

  if (!status?.enabled) return null

  const openConflicts = status.conflicts?.open ?? 0
  const pending = status.pendingPush ?? 0
  const tone =
    openConflicts > 0
      ? 'text-red-300'
      : !status.online
        ? 'text-amber-300'
        : pending > 0
          ? 'text-amber-200'
          : 'text-emerald-300'
  const Icon = openConflicts > 0 ? TriangleAlert : !status.online ? CloudOff : pending > 0 ? RefreshCw : Cloud
  const label =
    openConflicts > 0
      ? SYNC_LABELS.conflicts(openConflicts)
      : !status.online
        ? SYNC_LABELS.offline
        : pending > 0
          ? SYNC_LABELS.pending(pending)
          : SYNC_LABELS.online

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-2 flex w-full items-center gap-2 rounded-md text-left text-xs ${tone} hover:text-white`}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </button>
      <SyncDetailsModal open={open} onClose={() => setOpen(false)} status={status} />
    </>
  )
}
