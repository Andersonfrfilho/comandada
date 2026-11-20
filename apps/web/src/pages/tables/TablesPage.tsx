import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useCan } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { formatBRL } from '@/lib/listing'
import { ComandaBillModal } from './ComandaBillModal'
import { elapsedLabel } from './elapsed'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Plus, Minus, LayoutGrid, Map, Link2, ReceiptText } from 'lucide-react'
import { TableFloorMap } from './TableFloorMap'
import { TableSeats } from './TableSeats'
import { GuestsStepper } from './GuestsStepper'
import { guestsAtTable, seatsLabel } from './seatLayout'
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
  const [comandaModal, setComandaModal] = useState<{ tableId: string; tableNumber: number; capacity: number } | null>(null)
  const [openGuests, setOpenGuests] = useState(2)
  const [billComandaId, setBillComandaId] = useState<string | null>(null)
  const navigate = useNavigate()
  // Caixa vê as mesas para receber a conta; montar o salão e lançar pedido é de quem lança pedido.
  const canLaunch = useCan({ resource: 'orders', action: 'write' })
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

  function startOpenComanda(table: { id: string; number: number }) {
    const capacity = tables.find((candidate) => candidate.id === table.id)?.capacity ?? 2
    setOpenGuests(Math.min(2, capacity))
    setComandaModal({ tableId: table.id, tableNumber: table.number, capacity })
  }

  // Muda as pessoas da comanda já no card (cadeiras acendem na hora) e confirma na API.
  async function handleGuestsChange(comandaId: string, guestsCount: number) {
    queryClient.setQueryData<TableWithComanda[]>(['tables'], (previous) =>
      previous?.map((table) => {
        const comandas = (table.comandas ?? []).map((comanda) => (comanda.id === comandaId ? { ...comanda, guestsCount } : comanda))
        return { ...table, comandas, comanda: comandas[0] ?? null }
      })
    )
    try {
      await api.patch(`/comandas/${comandaId}/guests`, { guestsCount }, accessToken ?? undefined)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar as pessoas da mesa')
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
    }
  }

  async function handleOpenComanda() {
    if (!comandaModal) return
    setActionLoading(true)
    try {
      await api.post(`/tables/${comandaModal.tableId}/comanda`, { guestsCount: openGuests }, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      void queryClient.invalidateQueries({ queryKey: ['table-comandas'] })
      setComandaModal(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir a comanda')
    } finally {
      setActionLoading(false)
    }
  }

  // Uma comanda: abre a conta direto; várias: a lista para escolher de quem é a conta.
  function openBill(table: TableWithComanda) {
    if (table.comandas.length === 1 && table.comandas[0]) setBillComandaId(table.comandas[0].id)
    else setComandasTable({ id: table.id, number: table.number })
  }

  function selectOnMap(table: TableWithComanda) {
    if (table.comandas.length > 0) openBill(table)
    else if (canLaunch) openEdit(table)
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
          {viewMode === 'map' && canLaunch && (
            <button
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors active:scale-95 ${
                selectionMode
                  ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Link2 className="h-4 w-4" />
              {selectionMode ? 'Cancelar' : 'Juntar mesas'}
            </button>
          )}
          {canLaunch && <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Nova mesa
          </button>}
        </div>
      </div>

      {selectionMode && viewMode === 'map' && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 bg-brand-50 border border-brand-200 rounded-lg">
          <p className="text-sm text-brand-700">
            {selectedIds.size === 0
              ? 'Selecione ao menos 2 mesas para juntar.'
              : `${selectedIds.size} mesa${selectedIds.size !== 1 ? 's' : ''} selecionada${selectedIds.size !== 1 ? 's' : ''}.`}
          </p>
          <button
            onClick={() => void handleGroup()}
            disabled={selectedIds.size < 2 || actionLoading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
          onSelectTable={selectOnMap}
          onPositionChange={(tableId, positionX, positionY) => void handlePositionChange(tableId, positionX, positionY)}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onUngroup={(groupId) => void handleUngroup(groupId)}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tables.map((table) => {
            const guests = guestsAtTable(table.comandas)
            const singleComanda = table.comandas.length === 1 ? table.comandas[0] : undefined
            return (
            <div
              key={table.id}
              className={`flex flex-col border-2 rounded-xl p-3 sm:p-4 transition-all ${STATUS_CARD[table.status]}`}
            >
              <div className="flex justify-end">
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium border ${STATUS_COLORS[table.status]}`}>
                  {STATUS_LABELS[table.status]}
                </span>
              </div>
              <TableSeats
                number={table.number}
                capacity={table.capacity}
                guests={guests}
                status={table.status}
                className="block mx-auto mt-1 h-24 w-full max-w-[11rem]"
              />
              {canLaunch && singleComanda ? (
                <div className="flex items-center justify-between gap-1 mt-1 mb-3">
                  <button
                    type="button"
                    onClick={() => void handleGuestsChange(singleComanda.id, Math.max(1, (singleComanda.guestsCount ?? 1) - 1))}
                    disabled={(singleComanda.guestsCount ?? 0) <= 1}
                    aria-label={`Uma pessoa a menos na mesa ${table.number}`}
                    className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-[11px] leading-tight text-gray-600 text-center">
                    {guests === null ? (
                      'Quantas pessoas?'
                    ) : (
                      <>
                        <span className={`text-sm font-bold tabular-nums ${guests > table.capacity ? 'text-amber-700' : 'text-gray-900'}`}>{guests}</span>
                        <span className="tabular-nums">/{table.capacity}</span> pessoas
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleGuestsChange(singleComanda.id, Math.min(50, (singleComanda.guestsCount ?? 0) + 1))}
                    disabled={(singleComanda.guestsCount ?? 0) >= 50}
                    aria-label={`Uma pessoa a mais na mesa ${table.number}`}
                    className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500 text-center mt-1 mb-3 h-7 flex items-center justify-center">
                  {seatsLabel(table.capacity, guests)}
                </p>
              )}

              {table.comanda ? (
                <button
                  onClick={() => openBill(table)}
                  className="mb-3 w-full text-left rounded-lg bg-white/70 border border-white px-2 py-1.5 hover:bg-white transition-colors"
                >
                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                    {formatBRL(table.comandas.reduce((sum, comanda) => sum + (comanda.totalAmount ?? 0), 0))}
                  </p>
                  <p className="text-xs text-gray-600">
                    Ocupada {elapsedLabel(table.comandas.reduce((oldest, comanda) => (comanda.openedAt < oldest ? comanda.openedAt : oldest), table.comanda.openedAt))}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    <span className="font-mono">{table.comanda.code}</span>
                    {table.comandas.length > 1 ? ` +${table.comandas.length - 1}` : ''}
                    {table.comanda.customerName ? ` · ${table.comanda.customerName}` : ''}
                  </p>
                </button>
              ) : null}

              <div className="mt-auto space-y-1.5">
                {table.comandas.length > 0 && (
                  <button
                    onClick={() => openBill(table)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors active:scale-95"
                  >
                    <ReceiptText className="h-3.5 w-3.5" />
                    {table.comandas.length > 1 ? `Contas (${table.comandas.length})` : 'Ver conta'}
                  </button>
                )}
                {canLaunch && table.comanda && (
                  <button
                    onClick={() => navigate(`/orders/new?tableId=${table.id}${table.comandas.length === 1 ? `&comandaId=${table.comanda?.id}` : ''}`)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Lançar pedido
                  </button>
                )}
                {canLaunch && (
                  <button
                    onClick={() => startOpenComanda(table)}
                    className={`w-full px-2 py-1.5 text-xs font-medium rounded-lg transition-colors active:scale-95 ${
                      table.comandas.length > 0
                        ? 'border border-gray-300 text-gray-700 hover:bg-white/60'
                        : 'bg-brand-600 text-white hover:bg-brand-700'
                    }`}
                  >
                    {table.comandas.length > 0 ? 'Nova comanda' : 'Abrir comanda'}
                  </button>
                )}
                {canLaunch && (
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
                      aria-label={`Excluir mesa ${table.number}`}
                      className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
            )
          })}
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
            {canLaunch && <button
              onClick={() => {
                if (!comandasTable) return
                startOpenComanda(comandasTable)
                setComandasTable(null)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova comanda
            </button>}
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
                  <button
                    onClick={() => {
                      setBillComandaId(comanda.id)
                      setComandasTable(null)
                    }}
                    className="px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900 transition-colors active:scale-95 shrink-0"
                  >
                    {comanda.status === 'open' ? 'Conta' : 'Ver'}
                  </button>
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
          <p className="text-sm text-gray-500 mb-4">
            Um código único será gerado e poderá ser compartilhado com o cliente para confirmação dos dados.
          </p>
          {comandaModal && (
            <div className="flex items-center gap-4 mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <TableSeats
                number={comandaModal.tableNumber}
                capacity={comandaModal.capacity}
                guests={openGuests}
                status="occupied"
                className="h-24 w-24 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 mb-2">Quantas pessoas?</p>
                <GuestsStepper value={openGuests} onChange={setOpenGuests} size="md" />
                <p className="text-xs text-gray-500 mt-2">
                  {openGuests > comandaModal.capacity
                    ? `Passa dos ${comandaModal.capacity} lugares da mesa`
                    : seatsLabel(comandaModal.capacity, openGuests)}
                </p>
              </div>
            </div>
          )}
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

      <ComandaBillModal
        comandaId={billComandaId}
        tables={tables.map((table) => ({ id: table.id, number: table.number }))}
        onClose={() => setBillComandaId(null)}
      />

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
