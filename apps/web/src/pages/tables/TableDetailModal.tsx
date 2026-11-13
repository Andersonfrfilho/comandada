import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'

type TableStatus = 'available' | 'occupied' | 'reserved'
type ComandaHistoryStatus = 'open' | 'closed' | 'paid'

interface ComandaHistoryItem {
  id: string
  code: string
  status: ComandaHistoryStatus
  customerName: string | null
  customerPhone: string | null
  openedAt: string
  closedAt: string | null
}

interface TableDetailModalTable {
  id: string
  number: number
  capacity: number
  status: TableStatus
  comanda: { id: string; code: string; customerName: string | null } | null
}

interface TableDetailModalProps {
  table: TableDetailModalTable | null
  open: boolean
  onClose: () => void
  accessToken: string | undefined
  statusLabels: Record<TableStatus, string>
  statusColors: Record<TableStatus, string>
  onOpenComanda: () => void
  onCloseComanda: () => void
  onEdit: () => void
}

const COMANDA_STATUS_LABELS: Record<ComandaHistoryStatus, string> = {
  open: 'Aberta',
  closed: 'Encerrada',
  paid: 'Paga',
}

const COMANDA_STATUS_COLORS: Record<ComandaHistoryStatus, string> = {
  open: 'bg-green-100 text-green-800 border-green-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
  paid: 'bg-blue-100 text-blue-800 border-blue-200',
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TableDetailModal({
  table,
  open,
  onClose,
  accessToken,
  statusLabels,
  statusColors,
  onOpenComanda,
  onCloseComanda,
  onEdit,
}: TableDetailModalProps) {
  const { data: comandas = [], isLoading } = useQuery({
    queryKey: ['table-comandas', table?.id],
    queryFn: () => api.get<ComandaHistoryItem[]>(`/tables/${table!.id}/comandas`, accessToken),
    enabled: open && !!table,
  })

  return (
    <Modal open={open && !!table} onClose={onClose} title={table ? `Mesa ${table.number}` : undefined} size="md">
      {table && (
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{table.capacity} lugares</p>
            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium border ${statusColors[table.status]}`}>
              {statusLabels[table.status]}
            </span>
          </div>

          <div className="flex gap-2">
            {table.status === 'available' ? (
              <button
                onClick={onOpenComanda}
                className="flex-1 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
              >
                Abrir nova comanda
              </button>
            ) : table.comanda ? (
              <button
                onClick={onCloseComanda}
                className="flex-1 px-3 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors active:scale-95"
              >
                Encerrar comanda
              </button>
            ) : null}
            <button
              onClick={onEdit}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Editar mesa
            </button>
          </div>

          {table.comanda && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
              <QRCodeSVG
                value={`${window.location.origin}/comanda/${table.comanda.code}`}
                size={72}
                level="M"
              />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comanda ativa</p>
                <p className="text-sm font-mono font-bold text-gray-800">{table.comanda.code}</p>
                <p className="text-xs text-gray-400">Peça para o cliente escanear para confirmar os dados.</p>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Histórico de comandas</h3>
            {isLoading ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : comandas.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma comanda registrada para esta mesa.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {comandas.map((comanda) => (
                  <li key={comanda.id} className="border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-bold text-gray-800">{comanda.code}</span>
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${COMANDA_STATUS_COLORS[comanda.status]}`}
                      >
                        {COMANDA_STATUS_LABELS[comanda.status]}
                      </span>
                    </div>
                    {comanda.customerName ? (
                      <p className="text-xs text-gray-600 truncate">{comanda.customerName}</p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Sem confirmação de cliente</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Aberta em {formatDateTime(comanda.openedAt)}
                      {comanda.closedAt && ` · Encerrada em ${formatDateTime(comanda.closedAt)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
