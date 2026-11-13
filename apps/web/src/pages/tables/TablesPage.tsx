import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Plus, LayoutGrid, Map, Link2, ReceiptText } from 'lucide-react'
import { TableFloorMap } from './TableFloorMap'
import {
  TABLE_STATUS_LABELS,
  TABLE_STATUS_COLORS,
  TABLE_STATUS_CARD,
  COMANDA_STATUS_LABELS,
  COMANDA_STATUS_COLORS,
  type TableStatus,
  type Comanda,
  type TableWithComanda,
} from '@/constants/tableLabels'

const EMPTY_SELECTION = new Set<string>()

const STATUS_LABELS = TABLE_STATUS_LABELS
const STATUS_COLORS = TABLE_STATUS_COLORS
const STATUS_CARD = TABLE_STATUS_CARD

export function TablesPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<TableWithComanda | null>(null)
  const [formNumber, setFormNumber] = useState('')
  const [formCapacity, setFormCapacity] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [comandaModal, setComandaModal] = useState<{ tableId: string; tableNumber: number } | null>(null)
  const [closeModal, setCloseModal] = useState<{ comanda: Comanda; tableNumber: number } | null>(null)
  const [closeStatus, setCloseStatus] = useState<'closed' | 'paid'>('paid')
  const [actionLoading, setActionLoading] = useState(false)

  const { data: rawTables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get<TableWithComanda[]>('/tables', accessToken ?? undefined),
    refetchInterval: 15_000,
  })
  const tables = rawTables.map((table) => ({
    ...table,
    groupId: table.groupId ?? null,
    comandas: table.comandas ?? [],
  }))
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(EMPTY_SELECTION)
  const [groupError, setGroupError] = useState<string | null>(null)
  const [comandasTable, setComandasTable] = useState<{ id: string; number: number } | null>(null)

  const { data: tableComandas = [], isLoading: comandasLoading } = useQuery({
    queryKey: ['table-comandas', comandasTable?.id],
    queryFn: () => api.get<Comanda[]>(`/tables/${comandasTable!.id}/comandas`, accessToken ?? undefined),
    enabled: comandasTable !== null,
  })

  async function handlePositionChange(tableId: string, positionX: number, positionY: number) {
    try {
      await api.patch(`/tables/${tableId}/position`, { positionX, positionY }, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
    } catch {
      // Falha silenciosa: a mesa volta para a posição anterior no próximo refetch.
    }
  }

  function handleToggleSelect(tableId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(tableId)) next.delete(tableId)
      else next.add(tableId)
      return next
    })
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(EMPTY_SELECTION)
    setGroupError(null)
  }

  async function handleGroup() {
    setGroupError(null)
    setActionLoading(true)
    try {
      await api.post('/tables/group', { tableIds: [...selectedIds] }, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      exitSelectionMode()
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Não foi possível juntar as mesas')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUngroup(groupId: string) {
    setGroupError(null)
    try {
      await api.delete(`/tables/group/${groupId}`, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Não foi possível desagrupar as mesas')
    }
  }

  function openCreate() {
    setFormNumber('')
    setFormCapacity('')
    setFormError(null)
    setEditTarget(null)
    setModalMode('create')
  }

  function openEdit(table: TableWithComanda) {
    setFormNumber(String(table.number))
    setFormCapacity(String(table.capacity))
    setFormError(null)
    setEditTarget(table)
    setModalMode('edit')
  }

  async function handleSubmit() {
    const number = parseInt(formNumber)
    const capacity = parseInt(formCapacity)
    if (!number || number < 1) { setFormError('Número de mesa inválido'); return }
    if (!capacity || capacity < 1 || capacity > 50) { setFormError('Capacidade deve ser entre 1 e 50'); return }

    setFormLoading(true)
    setFormError(null)
    try {
      if (modalMode === 'create') {
        await api.post('/tables', { number, capacity }, accessToken ?? undefined)
      } else {
        await api.put(`/tables/${editTarget!.id}`, { number, capacity }, accessToken ?? undefined)
      }
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      setModalMode(null)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/tables/${id}`, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
    } finally {
      setDeleteConfirmId(null)
    }
  }

  async function handleOpenComanda() {
    if (!comandaModal) return
    setActionLoading(true)
    try {
      await api.post(`/tables/${comandaModal.tableId}/comanda`, {}, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      void queryClient.invalidateQueries({ queryKey: ['table-comandas'] })
      setComandaModal(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir comanda')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCloseComanda() {
    if (!closeModal) return
    setActionLoading(true)
    try {
      await api.patch(`/comandas/${closeModal.comanda.id}/close`, { status: closeStatus }, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      void queryClient.invalidateQueries({ queryKey: ['table-comandas'] })
      setCloseModal(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao encerrar comanda')
    } finally {
      setActionLoading(false)
    }
  }

  const available = tables.filter((t) => t.status === 'available').length
  const occupied = tables.filter((t) => t.status === 'occupied').length

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mesas</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tables.length} mesa{tables.length !== 1 ? 's' : ''} · {available} livre{available !== 1 ? 's' : ''} · {occupied} ocupada{occupied !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Visualização em grade"
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              aria-label="Visualização em mapa do salão"
              className={`p-2 transition-colors border-l border-gray-300 ${viewMode === 'map' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
            >
              <Map className="h-4 w-4" />
            </button>
          </div>
          {viewMode === 'map' && (
            <button
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors active:scale-95 ${
                selectionMode
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Link2 className="h-4 w-4" />
              {selectionMode ? 'Cancelar' : 'Juntar mesas'}
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Nova mesa
          </button>
        </div>
      </div>

      {selectionMode && viewMode === 'map' && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <p className="text-sm text-indigo-900">
            {selectedIds.size === 0
              ? 'Selecione ao menos 2 mesas para juntar.'
              : `${selectedIds.size} mesa${selectedIds.size !== 1 ? 's' : ''} selecionada${selectedIds.size !== 1 ? 's' : ''}.`}
          </p>
          <button
            onClick={() => void handleGroup()}
            disabled={selectedIds.size < 2 || actionLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Link2 className="h-4 w-4" />
            {actionLoading ? 'Juntando...' : 'Juntar selecionadas'}
          </button>
        </div>
      )}

      {groupError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {groupError}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">Nenhuma mesa cadastrada</p>
          <p className="text-sm">Clique em "+ Nova mesa" para começar</p>
        </div>
      ) : viewMode === 'map' ? (
        <TableFloorMap
          tables={tables}
          statusLabels={STATUS_LABELS}
          statusColors={STATUS_COLORS}
          statusCard={STATUS_CARD}
          onSelectTable={openEdit}
          onPositionChange={(tableId, positionX, positionY) => void handlePositionChange(tableId, positionX, positionY)}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onUngroup={(groupId) => void handleUngroup(groupId)}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tables.map((table) => (
            <div
              key={table.id}
              className={`border-2 rounded-xl p-4 transition-all ${STATUS_CARD[table.status]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{table.number}</p>
                  <p className="text-xs text-gray-500">{table.capacity} lugares</p>
                </div>
                <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[table.status]}`}>
                  {STATUS_LABELS[table.status]}
                </span>
              </div>

              {table.comanda ? (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-mono font-bold text-gray-800 bg-white/80 px-2 py-0.5 rounded border">
                      {table.comanda.code}
                    </span>
                    {table.comandas.length > 1 && (
                      <span className="text-xs font-medium text-gray-600 bg-white/80 px-1.5 py-0.5 rounded border">
                        +{table.comandas.length - 1}
                      </span>
                    )}
                  </div>
                  {table.comanda.customerName ? (
                    <p className="text-xs text-gray-600 truncate">{table.comanda.customerName}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Aguardando confirmação</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(table.comanda.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ) : (
                <div className="mb-3 h-[52px]" />
              )}

              <div className="space-y-1.5">
                <button
                  onClick={() => setComandaModal({ tableId: table.id, tableNumber: table.number })}
                  className="w-full px-2 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
                >
                  {table.comandas.length > 0 ? 'Nova comanda' : 'Abrir comanda'}
                </button>
                <button
                  onClick={() => setComandasTable({ id: table.id, number: table.number })}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-white/60 transition-colors active:scale-95"
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  Comandas{table.comandas.length > 0 ? ` (${table.comandas.length})` : ''}
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(table)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-white/60 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(table.id)}
                    disabled={table.status === 'occupied'}
                    className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar / editar mesa */}
      <Modal open={modalMode !== null} onClose={() => setModalMode(null)} title={modalMode === 'create' ? 'Nova mesa' : 'Editar mesa'} size="sm">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número da mesa *</label>
            <input
              type="number"
              min="1"
              value={formNumber}
              onChange={(e) => setFormNumber(e.target.value)}
              placeholder="Ex: 1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacidade *</label>
            <input
              type="number"
              min="1"
              max="50"
              value={formCapacity}
              onChange={(e) => setFormCapacity(e.target.value)}
              placeholder="Ex: 4"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button onClick={() => setModalMode(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={formLoading}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 active:scale-95"
          >
            {formLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>

      {/* Modal comandas da mesa */}
      <Modal open={comandasTable !== null} onClose={() => setComandasTable(null)} size="md">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 className="font-semibold text-gray-900">Comandas — Mesa {comandasTable?.number}</h2>
            <button
              onClick={() => {
                if (!comandasTable) return
                setComandaModal({ tableId: comandasTable.id, tableNumber: comandasTable.number })
                setComandasTable(null)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova comanda
            </button>
          </div>

          {comandasLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : tableComandas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma comanda nesta mesa ainda.</p>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
              {tableComandas.map((comanda) => (
                <li
                  key={comanda.id}
                  className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-mono font-bold text-gray-900">{comanda.code}</span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${COMANDA_STATUS_COLORS[comanda.status]}`}>
                        {COMANDA_STATUS_LABELS[comanda.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 truncate">
                      {comanda.customerName ?? <span className="text-gray-400 italic">Aguardando confirmação</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      Aberta às{' '}
                      {new Date(comanda.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {comanda.status === 'open' && comandasTable && (
                    <button
                      onClick={() => {
                        setCloseModal({ comanda, tableNumber: comandasTable.number })
                        setComandasTable(null)
                      }}
                      className="px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900 transition-colors active:scale-95 shrink-0"
                    >
                      Encerrar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Modal abrir comanda */}
      <Modal open={comandaModal !== null} onClose={() => setComandaModal(null)} size="sm">
        <div className="p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Abrir comanda — Mesa {comandaModal?.tableNumber}</h2>
          <p className="text-sm text-gray-500 mb-5">
            Um código único será gerado e poderá ser compartilhado com o cliente para confirmação dos dados.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setComandaModal(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={() => void handleOpenComanda()}
              disabled={actionLoading}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 active:scale-95"
            >
              {actionLoading ? 'Abrindo...' : 'Abrir comanda'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal encerrar comanda */}
      <Modal open={closeModal !== null} onClose={() => setCloseModal(null)} size="sm">
        <div className="p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Encerrar comanda — Mesa {closeModal?.tableNumber}</h2>
          <p className="text-xs font-mono text-gray-400 mb-4">Código: {closeModal?.comanda.code}</p>
          {closeModal?.comanda.customerName && (
            <p className="text-sm text-gray-600 mb-4">Cliente: {closeModal.comanda.customerName}</p>
          )}
          <div className="space-y-2 mb-5">
            {(['paid', 'closed'] as const).map((s) => (
              <label key={s} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  value={s}
                  checked={closeStatus === s}
                  onChange={() => setCloseStatus(s)}
                  className="text-brand-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{s === 'paid' ? 'Pago e encerrado' : 'Encerrado sem pagamento'}</p>
                  <p className="text-xs text-gray-400">{s === 'paid' ? 'Cliente realizou o pagamento' : 'Cancelado ou encerrado manualmente'}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setCloseModal(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={() => void handleCloseComanda()}
              disabled={actionLoading}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 active:scale-95"
            >
              {actionLoading ? 'Encerrando...' : 'Encerrar comanda'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal confirmar exclusão */}
      <Modal open={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} size="sm">
        <div className="p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Excluir mesa?</h2>
          <p className="text-sm text-gray-500 mb-5">Esta ação não pode ser desfeita.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={() => deleteConfirmId && void handleDelete(deleteConfirmId)}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 active:scale-95"
            >
              Excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
