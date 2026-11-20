import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ArrowRightLeft } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/listing'
import { useAuthStore, useCan } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orderLabels'
import { COMANDA_STATUS_LABELS, type ComandaStatus } from '@/constants/tableLabels'
import { PaymentStep, type PaymentLeg } from '../orders/PaymentStep'
import { elapsedLabel } from './elapsed'
import { Select } from '@/components/ui/Select'

interface BillItem {
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  notes: string | null
}

interface BillOrder {
  id: string
  displayCode: string
  status: OrderStatus
  createdAt: string
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  items: BillItem[]
}

export interface ComandaBill {
  comanda: {
    id: string
    code: string
    status: ComandaStatus
    customerName: string | null
    openedAt: string
    closedAt: string | null
    tableId: string
    tableNumber: number
  }
  orders: BillOrder[]
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
}

interface TableOption {
  id: string
  number: number
}

interface PaymentTypeRow {
  name: string
  label: string
}

interface ComandaBillModalProps {
  comandaId: string | null
  tables: TableOption[]
  onClose: () => void
}

function newLeg(amount: number): PaymentLeg {
  return { id: crypto.randomUUID(), paymentTypeName: '', amount: amount.toFixed(2), changeFor: '', splitLabel: '' }
}

/**
 * Conta da mesa: o que cada pedido da comanda consumiu, quanto já foi pago e quanto falta. Quem lança
 * pedido acrescenta pedido e troca de mesa; quem cuida do caixa recebe (dividido por pessoa ou misto),
 * e o recebimento entra no caixa e libera a mesa.
 */
export function ComandaBillModal({ comandaId, tables, onClose }: ComandaBillModalProps) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const canLaunch = useCan({ resource: 'orders', action: 'write' })
  const canReceive = useCan({ resource: 'cashier', action: 'write' })
  const [payments, setPayments] = useState<PaymentLeg[] | null>(null)
  const [transferTo, setTransferTo] = useState<string | null>(null)

  const { data: bill, isLoading } = useQuery({
    queryKey: ['comanda-bill', comandaId],
    queryFn: () => api.get<ComandaBill>(`/comandas/${comandaId}/bill`, accessToken),
    enabled: comandaId !== null,
    refetchInterval: 15_000,
  })

  const { data: paymentTypes = [] } = useQuery({
    queryKey: ['payment-types'],
    queryFn: () => api.get<PaymentTypeRow[]>('/payment-types', accessToken),
    enabled: comandaId !== null && canReceive,
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['tables'] })
    void queryClient.invalidateQueries({ queryKey: ['table-comandas'] })
    void queryClient.invalidateQueries({ queryKey: ['comanda-bill', comandaId] })
  }

  function close() {
    setPayments(null)
    setTransferTo(null)
    onClose()
  }

  const settle = useMutation({
    mutationFn: (legs: PaymentLeg[]) =>
      api.post<ComandaBill>(
        `/comandas/${comandaId}/settle`,
        {
          payments: legs.map((leg) => ({
            paymentTypeName: leg.paymentTypeName,
            amount: Number(leg.amount),
            ...(leg.changeFor ? { changeFor: Number(leg.changeFor) } : {}),
            ...(legs.length > 1 && leg.splitLabel ? { splitLabel: leg.splitLabel } : {}),
          })),
        },
        accessToken
      ),
    onSuccess: (paid) => {
      refresh()
      toast.success(`Conta da mesa ${paid.comanda.tableNumber} recebida (${formatBRL(paid.totalAmount)})`)
      close()
    },
  })

  const closeWithoutPayment = useMutation({
    mutationFn: () => api.patch(`/comandas/${comandaId}/close`, {}, accessToken),
    onSuccess: () => {
      refresh()
      toast.success('Comanda encerrada')
      close()
    },
  })

  const transfer = useMutation({
    mutationFn: (tableId: string) => api.patch(`/comandas/${comandaId}/transfer`, { tableId }, accessToken),
    onSuccess: () => {
      refresh()
      const target = tables.find((table) => table.id === transferTo)
      toast.success(`Comanda passou para a mesa ${target?.number ?? ''}`)
      setTransferTo(null)
    },
  })

  const isOpen = bill?.comanda.status === 'open'
  const busy = settle.isPending || closeWithoutPayment.isPending || transfer.isPending
  const paymentsSum = (payments ?? []).reduce((sum, leg) => sum + (Number(leg.amount) || 0), 0)
  const paymentsValid =
    payments !== null &&
    payments.length > 0 &&
    payments.every((leg) => leg.paymentTypeName.length > 0 && Number(leg.amount) > 0) &&
    bill !== undefined &&
    Math.abs(paymentsSum - bill.outstandingAmount) < 0.01
  const otherTables = tables.filter((table) => table.id !== bill?.comanda.tableId)

  return (
    <Modal
      open={comandaId !== null}
      onClose={close}
      title={bill ? `Conta da mesa ${bill.comanda.tableNumber}` : 'Conta da mesa'}
      size="lg"
    >
      {isLoading || !bill ? (
        <div className="p-5 space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="max-h-[75vh] overflow-y-auto">
          <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100">
            <div className="text-sm text-gray-600">
              <span className="font-mono font-bold text-gray-900">{bill.comanda.code}</span>
              {bill.comanda.customerName && <span> · {bill.comanda.customerName}</span>}
              <span className="text-gray-400"> · aberta {elapsedLabel(bill.comanda.openedAt)}</span>
            </div>
            {!isOpen && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {COMANDA_STATUS_LABELS[bill.comanda.status]}
              </span>
            )}
          </div>

          <div className="px-5 py-4 space-y-3">
            {bill.orders.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum pedido lançado nesta comanda ainda.</p>
            ) : (
              bill.orders.map((order) => (
                <div key={order.id} className="rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-lg">
                    <span className="text-sm font-semibold text-gray-900">
                      Pedido {order.displayCode}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${ORDER_STATUS_COLORS[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  <ul className={`px-3 py-2 space-y-1 ${order.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}>
                    {order.items.map((item, index) => (
                      <li key={index} className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          {item.quantity}x {item.productName}
                          {item.notes && <span className="block text-xs text-gray-400">{item.notes}</span>}
                        </span>
                        <span className="tabular-nums shrink-0">{formatBRL(item.totalPrice)}</span>
                      </li>
                    ))}
                  </ul>
                  {order.paidAmount > 0 && order.status !== 'cancelled' && (
                    <p className="px-3 pb-2 text-xs text-green-700">Pago: {formatBRL(order.paidAmount)}</p>
                  )}
                </div>
              ))
            )}
          </div>

          <dl className="mx-5 mb-4 rounded-lg bg-gray-50 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-600">Consumo</dt>
              <dd className="tabular-nums">{formatBRL(bill.totalAmount)}</dd>
            </div>
            {bill.paidAmount > 0 && (
              <div className="flex justify-between text-green-700">
                <dt>Já pago</dt>
                <dd className="tabular-nums">− {formatBRL(bill.paidAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-200">
              <dt>{isOpen ? 'A receber' : 'Total'}</dt>
              <dd className="tabular-nums">{formatBRL(isOpen ? bill.outstandingAmount : bill.totalAmount)}</dd>
            </div>
          </dl>

          {isOpen && transferTo !== null && (
            <div className="mx-5 mb-4 rounded-lg border border-gray-200 p-3 space-y-2">
              <label htmlFor="transfer-table" className="block text-sm font-medium text-gray-700">
                Passar a comanda para a mesa
              </label>
              <div className="flex gap-2">
                <Select
                  id="transfer-table"
                  className="flex-1"
                  value={transferTo || null}
                  onChange={setTransferTo}
                  placeholder="Escolha a mesa"
                  title="Passar para a mesa"
                  options={otherTables.map((table) => ({ value: table.id, label: `Mesa ${table.number}` }))}
                />
                <button
                  onClick={() => transferTo && transfer.mutate(transferTo)}
                  disabled={!transferTo || busy}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg disabled:opacity-40"
                >
                  {transfer.isPending ? 'Passando...' : 'Passar'}
                </button>
                <button onClick={() => setTransferTo(null)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                  Voltar
                </button>
              </div>
            </div>
          )}

          {isOpen && payments !== null && (
            <div className="border-t border-gray-100">
              <PaymentStep
                payments={payments}
                total={bill.outstandingAmount}
                paymentTypeOptions={paymentTypes.map((type) => ({ value: type.name, label: type.label }))}
                onChange={setPayments}
              />
            </div>
          )}

          {isOpen && (
            <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-gray-200">
              {canLaunch && payments === null && (
                <>
                  <button
                    onClick={() => setTransferTo('')}
                    disabled={busy || otherTables.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ArrowRightLeft className="h-4 w-4" /> Trocar de mesa
                  </button>
                  <button
                    onClick={() => navigate(`/orders/new?tableId=${bill.comanda.tableId}&comandaId=${bill.comanda.id}`)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" /> Lançar pedido
                  </button>
                </>
              )}
              {bill.outstandingAmount === 0 && canLaunch && (
                <button
                  onClick={() => closeWithoutPayment.mutate()}
                  disabled={busy}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg disabled:opacity-40"
                >
                  {closeWithoutPayment.isPending ? 'Encerrando...' : 'Encerrar comanda'}
                </button>
              )}
              {bill.outstandingAmount > 0 && canReceive && payments === null && (
                <button
                  onClick={() => setPayments([newLeg(bill.outstandingAmount)])}
                  className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
                >
                  Receber {formatBRL(bill.outstandingAmount)}
                </button>
              )}
              {payments !== null && (
                <>
                  <button
                    onClick={() => setPayments(null)}
                    disabled={busy}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => settle.mutate(payments)}
                    disabled={!paymentsValid || busy}
                    className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
                  >
                    {settle.isPending ? 'Recebendo...' : 'Confirmar recebimento'}
                  </button>
                </>
              )}
              {bill.outstandingAmount > 0 && !canReceive && (
                <p className="w-full text-right text-xs text-gray-500">Quem cuida do caixa recebe a conta.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
