import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BellRing, ReceiptText, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/listing'
import { useAuthStore } from '@/stores/authStore'
import { Skeleton } from '@/components/ui/Skeleton'
import type { TableWithComanda } from '@/constants/tableLabels'
import { elapsedLabel } from '@/pages/tables/elapsed'
import { TableSeats } from '@/pages/tables/TableSeats'
import { useWaiterAlertsStore } from './waiterAlerts'
import { waiterPaths } from './waiterModel'

type TableFilter = 'all' | 'available' | 'occupied' | 'bill'

const FILTER_LABELS: Record<TableFilter, string> = {
  all: 'Todas',
  available: 'Livres',
  occupied: 'Ocupadas',
  bill: 'Conta pedida',
}

export interface TableSummary {
  table: TableWithComanda
  total: number
  guests: number
  openedAt: string | null
  customerLabel: string | null
  billRequested: boolean
}

export function summarizeTable(table: TableWithComanda): TableSummary {
  const comandas = table.comandas ?? []
  const names = comandas.map((comanda) => comanda.customerName).filter((name): name is string => Boolean(name))
  return {
    table,
    total: comandas.reduce((sum, comanda) => sum + (comanda.totalAmount ?? 0), 0),
    guests: comandas.reduce((sum, comanda) => sum + (comanda.guestsCount ?? 0), 0),
    openedAt: comandas.reduce<string | null>(
      (oldest, comanda) => (oldest === null || comanda.openedAt < oldest ? comanda.openedAt : oldest),
      null
    ),
    customerLabel: names.length === 0 ? null : names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`,
    billRequested: comandas.some((comanda) => Boolean(comanda.billRequestedAt)),
  }
}

function matchesFilter(summary: TableSummary, filter: TableFilter): boolean {
  if (filter === 'available') return summary.table.comandas.length === 0
  if (filter === 'occupied') return summary.table.comandas.length > 0
  if (filter === 'bill') return summary.billRequested
  return true
}

function tileTone(summary: TableSummary): string {
  if (summary.billRequested) return 'bg-amber-50 ring-amber-300'
  if (summary.table.comandas.length > 0) return 'bg-brand-50 ring-brand-300'
  if (summary.table.status === 'reserved') return 'bg-yellow-50 ring-yellow-200'
  return 'bg-white ring-gray-200'
}

/** Salão na mão do garçom: uma tela de mesas grandes para tocar, com consumo, pessoas e tempo. */
export function WaiterTablesPage() {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TableFilter>('all')
  const notices = useWaiterAlertsStore((state) => state.notices)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get<TableWithComanda[]>('/tables', accessToken),
    refetchInterval: 15_000,
  })

  const summaries = useMemo(
    () =>
      tables
        .map((table) => summarizeTable({ ...table, comandas: table.comandas ?? [] }))
        .sort((left, right) => left.table.number - right.table.number),
    [tables]
  )
  const counts: Record<TableFilter, number> = {
    all: summaries.length,
    available: summaries.filter((summary) => matchesFilter(summary, 'available')).length,
    occupied: summaries.filter((summary) => matchesFilter(summary, 'occupied')).length,
    bill: summaries.filter((summary) => matchesFilter(summary, 'bill')).length,
  }
  const visible = summaries.filter((summary) => matchesFilter(summary, filter))
  const readyByTable = new Map<string, number>()
  for (const notice of notices) {
    if (notice.tableId) readyByTable.set(notice.tableId, (readyByTable.get(notice.tableId) ?? 0) + 1)
  }

  return (
    <div className="px-3 pb-6 pt-3">
      <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist">
        {(Object.keys(FILTER_LABELS) as TableFilter[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
              filter === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'
            }`}
          >
            {FILTER_LABELS[key]}
            <span className={`text-xs tabular-nums ${filter === key ? 'text-gray-300' : 'text-gray-400'}`}>{counts[key]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500">
          {tables.length === 0 ? 'Nenhuma mesa cadastrada. Cadastre as mesas no painel, em Mesas.' : 'Nenhuma mesa aqui.'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((summary) => {
            const { table } = summary
            const occupied = table.comandas.length > 0
            const ready = readyByTable.get(table.id) ?? 0
            return (
              <li key={table.id}>
                <button
                  onClick={() => navigate(waiterPaths.table(table.id))}
                  className={`relative flex h-full min-h-[128px] w-full flex-col rounded-2xl p-3 text-left shadow-sm ring-2 transition-transform active:scale-[0.97] ${tileTone(summary)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-3xl font-black leading-none tabular-nums text-gray-900">{table.number}</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
                      <Users className="h-3.5 w-3.5" />
                      {occupied && summary.guests > 0 ? `${summary.guests}/${table.capacity}` : table.capacity}
                    </span>
                  </div>
                  {/* Mesma mesa com cadeiras do painel: as cheias são as pessoas na comanda. */}
                  <TableSeats
                    number={table.number}
                    capacity={table.capacity}
                    guests={occupied && summary.guests > 0 ? summary.guests : null}
                    status={table.status}
                    className="pointer-events-none mx-auto my-1 block h-16 w-full max-w-[8rem]"
                  />
                  {occupied ? (
                    <div className="mt-auto pt-2">
                      <p className="text-lg font-bold tabular-nums text-gray-900">{formatBRL(summary.total)}</p>
                      <p className="truncate text-xs text-gray-600">
                        {summary.customerLabel ?? `${table.comandas.length} comanda${table.comandas.length > 1 ? 's' : ''}`}
                      </p>
                      {summary.openedAt && <p className="text-[11px] text-gray-500">{elapsedLabel(summary.openedAt)}</p>}
                    </div>
                  ) : (
                    <p className="mt-auto pt-2 text-sm font-semibold text-emerald-700">
                      {table.status === 'reserved' ? 'Reservada' : 'Livre'}
                    </p>
                  )}
                  {(summary.billRequested || ready > 0) && (
                    <div className="absolute -right-1 -top-2 flex gap-1">
                      {ready > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                          <BellRing className="h-3 w-3" />
                          {ready}
                        </span>
                      )}
                      {summary.billRequested && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                          <ReceiptText className="h-3 w-3" />
                          Conta
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
