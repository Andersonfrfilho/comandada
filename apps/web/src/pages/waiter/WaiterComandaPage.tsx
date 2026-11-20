import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, CloudOff, Phone, Plus, ReceiptText, Users, Wallet } from 'lucide-react'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/listing'
import { useAuthStore, useCan } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import type { TableWithComanda } from '@/constants/tableLabels'
import { ComandaBillModal } from '@/pages/tables/ComandaBillModal'
import { elapsedLabel } from '@/pages/tables/elapsed'
import { useWaiterAlertsStore } from './waiterAlerts'
import { sendOrQueue, useWaiterOutboxStore } from './waiterOffline'
import { ITEM_STAGE_LABELS, newClientId, formatPhoneInput, itemStage, waiterPaths, type ItemStage, type WaiterBill } from './waiterModel'

const STAGE_TONE: Record<ItemStage, string> = {
  waiting: 'bg-gray-100 text-gray-700',
  preparing: 'bg-yellow-100 text-yellow-800',
  ready: 'bg-emerald-100 text-emerald-800',
  served: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-red-50 text-red-600 line-through',
}

/** Comanda do cliente: o que já foi pedido (e se a cozinha já fez), total, lançar mais e pedir a conta. */
export function WaiterComandaPage() {
  const { comandaId = '' } = useParams()
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const canReceive = useCan({ resource: 'cashier', action: 'write' })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [receiving, setReceiving] = useState(false)
  const dismissNotice = useWaiterAlertsStore((state) => state.dismiss)
  const pendingNotices = useWaiterAlertsStore((state) => state.notices)
  const allOutbox = useWaiterOutboxStore((state) => state.entries)
  const discardOutbox = useWaiterOutboxStore((state) => state.remove)
  const queued = allOutbox.filter((entry) => entry.comandaId === comandaId)
  const queuedTotal = queued.filter((entry) => entry.kind === 'order' && !entry.rejected).reduce((sum, entry) => sum + entry.total, 0)

  const { data: bill, isLoading } = useQuery({
    queryKey: ['comanda-bill', comandaId],
    queryFn: () => api.get<WaiterBill>(`/comandas/${comandaId}/bill`, accessToken),
    refetchInterval: 15_000,
  })
  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get<TableWithComanda[]>('/tables', accessToken),
    enabled: canReceive,
  })

  const requestBill = useMutation({
    networkMode: 'always',
    mutationFn: (requested: boolean) =>
      sendOrQueue({
        id: newClientId(),
        kind: 'request-bill',
        path: `/comandas/${comandaId}/request-bill`,
        body: { requested },
        comandaId,
        label: requested ? 'Pedir a conta' : 'Desfazer pedido de conta',
        total: 0,
      }),
    onSuccess: (outcome, requested) => {
      void queryClient.invalidateQueries({ queryKey: ['comanda-bill', comandaId] })
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      if (outcome.queued) toast.info('Sem conexão: o pedido de conta sai assim que a conexão voltar')
      else toast.success(requested ? 'Conta pedida: o caixa já foi avisado' : 'Pedido de conta desfeito')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível pedir a conta'),
  })

  if (isLoading || !bill) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    )
  }

  const { comanda } = bill
  const isOpen = comanda.status === 'open'
  const billRequested = Boolean(comanda.billRequestedAt)
  const activeOrders = bill.orders.filter((order) => order.status !== 'cancelled')

  return (
    <div className="pb-40">
      <div className="px-3 pt-2">
        <div className="mb-3 flex items-start gap-2">
          <Link
            to={waiterPaths.table(comanda.tableId)}
            aria-label="Voltar à mesa"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-gray-200"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Mesa {comanda.tableNumber}</p>
            <h1 className="truncate text-xl font-black leading-tight">{comanda.customerName ?? 'Cliente sem nome'}</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
              <span className="font-mono">{comanda.code}</span>
              {comanda.guestsCount ? (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {comanda.guestsCount}
                </span>
              ) : null}
              {comanda.customerPhone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatPhoneInput(comanda.customerPhone)}
                </span>
              ) : null}
              <span>aberta {elapsedLabel(comanda.openedAt)}</span>
            </p>
          </div>
        </div>

        {billRequested && isOpen && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
            <ReceiptText className="h-4 w-4" />
            Conta pedida {elapsedLabel(comanda.billRequestedAt!)} — aguardando o caixa
          </div>
        )}
        {!isOpen && (
          <div className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 ring-1 ring-blue-200">
            Comanda {comanda.status === 'paid' ? 'paga' : 'encerrada'}.
          </div>
        )}

        {queued.length > 0 && (
          <ul className="mb-3 space-y-2" aria-label="Aguardando conexão">
            {queued.map((entry) => (
              <li
                key={entry.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${
                  entry.rejected ? 'bg-red-50 ring-red-200' : 'bg-sky-50 ring-sky-200'
                }`}
              >
                <CloudOff className={`h-5 w-5 shrink-0 ${entry.rejected ? 'text-red-600' : 'text-sky-700'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{entry.kind === 'order' ? `Pedido · ${entry.label}` : entry.label}</p>
                  <p className={`text-xs ${entry.rejected ? 'text-red-700' : 'text-sky-800'}`}>
                    {entry.rejected ?? 'Aguardando conexão, envia sozinho'}
                  </p>
                </div>
                {entry.rejected && (
                  <button
                    onClick={() => discardOutbox(entry.id)}
                    className="h-9 rounded-lg px-3 text-xs font-semibold text-red-700 ring-1 ring-red-300 active:scale-95"
                  >
                    Descartar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {activeOrders.length === 0 && queued.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 ring-1 ring-gray-300">
            Nada pedido ainda. Toque em <strong>Lançar itens</strong>.
          </p>
        )}

        <ul className="space-y-3">
          {bill.orders.map((order) => (
            <li key={order.id} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-300">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{order.displayCode}</span>
                <span>
                  {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <ul className="divide-y divide-gray-100">
                {order.items.map((item, index) => {
                  const stage = itemStage(order, item)
                  return (
                    <li key={`${order.id}-${index}`} className="flex items-start gap-2 py-2">
                      <span className="w-7 shrink-0 text-right text-sm font-bold tabular-nums">{item.quantity}×</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{item.productName}</p>
                        {item.notes && <p className="text-xs italic text-gray-500">{item.notes}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_TONE[stage]}`}>
                        {ITEM_STAGE_LABELS[stage]}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {pendingNotices.some((notice) => notice.orderId === order.id) && (
                <button
                  onClick={() => dismissNotice(order.id)}
                  className="mt-2 h-10 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white active:scale-[0.98]"
                >
                  Levei para a mesa
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-3 pt-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-gray-600">
              Total{bill.paidAmount > 0 ? ` · pago ${formatBRL(bill.paidAmount)}` : ''}
              {queuedTotal > 0 ? ` · + ${formatBRL(queuedTotal)} na fila` : ''}
            </span>
            <span className="text-2xl font-black tabular-nums">{formatBRL(bill.totalAmount)}</span>
          </div>
          {isOpen && (
            <div className="flex gap-2">
              <button
                onClick={() => requestBill.mutate(!billRequested)}
                disabled={requestBill.isPending}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold active:scale-95 disabled:opacity-50 ${
                  billRequested ? 'text-gray-700 ring-1 ring-gray-300' : 'bg-amber-500 text-white'
                }`}
              >
                <ReceiptText className="h-4 w-4" />
                {billRequested ? 'Desfazer conta' : 'Pedir a conta'}
              </button>
              {canReceive && (
                <button
                  onClick={() => setReceiving(true)}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 text-sm font-semibold text-white active:scale-95"
                >
                  <Wallet className="h-4 w-4" />
                  Receber
                </button>
              )}
              <button
                onClick={() => navigate(waiterPaths.launch(comanda.id))}
                className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-base font-bold text-white active:scale-[0.98]"
              >
                <Plus className="h-5 w-5" />
                Lançar itens
              </button>
            </div>
          )}
        </div>
      </div>

      {canReceive && (
        <ComandaBillModal
          comandaId={receiving ? comanda.id : null}
          tables={tables.map((table) => ({ id: table.id, number: table.number }))}
          onClose={() => {
            setReceiving(false)
            void queryClient.invalidateQueries({ queryKey: ['comanda-bill', comandaId] })
          }}
        />
      )}
    </div>
  )
}
