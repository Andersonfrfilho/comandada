import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, type OrderStatus, type OrderType } from '@/constants/orderLabels'
import { Skeleton } from '@/components/ui/Skeleton'
import { addDaysToIsoDate, formatAgendaDate, todayIsoDate } from './agendaDates'

interface AgendaScheduledOrder {
  id: string
  code: string | null
  time: string
  type: OrderType
  status: OrderStatus
  totalAmount: string
  customerName: string | null
  itemsSummary: string
}

interface AgendaReservation {
  id: string
  code: string
  time: string
  partySize: number
  tableNumber: number | null
  customerName: string | null
  status: string
}

interface AgendaDay {
  date: string
  scheduledOrders: AgendaScheduledOrder[]
  reservations: AgendaReservation[]
}

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  requested: 'Solicitada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Concluída',
  no_show: 'Não compareceu',
}

export function AgendaPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [date, setDate] = useState(todayIsoDate)

  const { data, isLoading } = useQuery({
    queryKey: ['agenda', date],
    queryFn: () => api.get<{ data: AgendaDay }>(`/agenda?date=${date}`, accessToken ?? undefined),
    refetchInterval: 60_000,
  })
  const agenda = data?.data

  return (
    <main className="mx-auto max-w-4xl p-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <CalendarDays className="h-5 w-5" /> Agenda do dia
        </h1>
        <nav className="flex items-center gap-1" aria-label="Escolher dia">
          <button type="button" className="rounded p-2 hover:bg-gray-100" aria-label="Dia anterior" onClick={() => setDate(addDaysToIsoDate(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayIsoDate())}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button type="button" className="rounded p-2 hover:bg-gray-100" aria-label="Próximo dia" onClick={() => setDate(addDaysToIsoDate(date, 1))}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      </header>
      <p className="mb-4 text-sm text-gray-500">{formatAgendaDate(date)}</p>

      {isLoading || !agenda ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ScheduledOrdersSection orders={agenda.scheduledOrders} />
          <ReservationsSection reservations={agenda.reservations} />
        </div>
      )}
    </main>
  )
}

function ScheduledOrdersSection({ orders }: { orders: AgendaScheduledOrder[] }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Encomendas ({orders.length})</h2>
      {orders.length === 0 && <p className="text-sm text-gray-500">Nenhuma encomenda neste dia.</p>}
      <ul className="space-y-2">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`} className="block rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-900">{order.time}</span>
                <span className="text-xs text-gray-500">
                  {ORDER_TYPE_LABELS[order.type]} · {ORDER_STATUS_LABELS[order.status]}
                </span>
              </div>
              <p className="text-sm text-gray-800">{order.customerName ?? 'Cliente'} {order.code ? `· ${order.code}` : ''}</p>
              <p className="text-xs text-gray-500">{order.itemsSummary}</p>
              <p className="text-xs text-gray-600">R$ {Number(order.totalAmount).toFixed(2).replace('.', ',')}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReservationsSection({ reservations }: { reservations: AgendaReservation[] }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Reservas ({reservations.length})</h2>
      {reservations.length === 0 && <p className="text-sm text-gray-500">Nenhuma reserva neste dia.</p>}
      <ul className="space-y-2">
        {reservations.map((reservation) => (
          <li key={reservation.id} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-900">{reservation.time}</span>
              <span className="text-xs text-gray-500">{RESERVATION_STATUS_LABELS[reservation.status] ?? reservation.status}</span>
            </div>
            <p className="text-sm text-gray-800">
              {reservation.customerName ?? 'Cliente'} · {reservation.partySize} pessoas
              {reservation.tableNumber !== null ? ` · Mesa ${reservation.tableNumber}` : ''}
            </p>
            <p className="text-xs text-gray-500">{reservation.code}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
