import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, ReceiptText, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/listing'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Comanda, TableWithComanda } from '@/constants/tableLabels'
import { elapsedLabel } from '@/pages/tables/elapsed'
import { OpenComandaForm, type OpenComandaPayload } from './OpenComandaForm'
import { waiterPaths } from './waiterModel'

/** Mesa: as comandas abertas (uma por cliente) e a abertura de comanda nova. */
export function WaiterTablePage() {
  const { tableId = '' } = useParams()
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get<TableWithComanda[]>('/tables', accessToken),
    refetchInterval: 15_000,
  })
  const table = tables.find((candidate) => candidate.id === tableId)
  const comandas = table?.comandas ?? []

  const openComanda = useMutation({
    mutationFn: (payload: OpenComandaPayload) => api.post<Comanda>(`/tables/${tableId}/comanda`, payload, accessToken),
    onSuccess: (comanda) => {
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      toast.success(`Comanda ${comanda.code} aberta na mesa ${table?.number ?? ''}`)
      navigate(waiterPaths.launch(comanda.id), { replace: true })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a comanda'),
  })

  if (isLoading) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    )
  }

  if (!table) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-600">Mesa não encontrada.</p>
        <Link to={waiterPaths.tables} className="mt-3 inline-block text-sm font-semibold text-brand-700">
          Voltar às mesas
        </Link>
      </div>
    )
  }

  const showForm = opening || comandas.length === 0

  return (
    <div className="px-3 pb-8 pt-2">
      <div className="mb-3 flex items-center gap-2">
        <Link to={waiterPaths.tables} aria-label="Voltar às mesas" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-gray-200">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-black leading-tight">Mesa {table.number}</h1>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <Users className="h-3.5 w-3.5" />
            {table.capacity} lugares
          </p>
        </div>
      </div>

      {comandas.length > 0 && (
        <ul className="mb-4 space-y-2">
          {comandas.map((comanda) => (
            <li key={comanda.id}>
              <button
                onClick={() => navigate(waiterPaths.comanda(comanda.id))}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-gray-200 active:scale-[0.98]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-gray-900">{comanda.customerName ?? 'Sem nome'}</p>
                  <p className="text-xs text-gray-500">
                    <span className="font-mono">{comanda.code}</span>
                    {comanda.guestsCount ? ` · ${comanda.guestsCount} pessoa${comanda.guestsCount > 1 ? 's' : ''}` : ''}
                    {` · ${elapsedLabel(comanda.openedAt)}`}
                  </p>
                  {comanda.billRequestedAt && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      <ReceiptText className="h-3 w-3" /> Conta pedida
                    </p>
                  )}
                </div>
                <span className="text-lg font-bold tabular-nums">{formatBRL(comanda.totalAmount ?? 0)}</span>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-3 text-base font-bold">{comandas.length > 0 ? 'Nova comanda nesta mesa' : 'Abrir comanda'}</h2>
          <OpenComandaForm
            tableNumber={table.number}
            capacity={table.capacity}
            submitting={openComanda.isPending}
            onSubmit={(payload) => openComanda.mutate(payload)}
            {...(comandas.length > 0 ? { onCancel: () => setOpening(false) } : {})}
          />
        </section>
      ) : (
        <button
          onClick={() => setOpening(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-gray-700 ring-1 ring-dashed ring-gray-300 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Nova comanda (outro cliente na mesma mesa)
        </button>
      )}
    </div>
  )
}
