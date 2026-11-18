import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Check, CheckCircle2, Copy, CreditCard, MessageCircle, XCircle } from 'lucide-react'
import { formatBRL } from '@/lib/listing'
import { storefrontApi, type OrderPayment, type StorefrontOrderStatus } from './storefrontApi'
import { currentStepIndex, isFinalStatus, statusSteps, whatsappLink } from './storefrontFormat'

const POLL_INTERVAL_MS = 10_000

function formatTime(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

/** Acompanhamento do pedido do cardápio online: status, previsão e o Pix quando ainda falta pagar. */
export function StorefrontOrderPage() {
  const { orderId = '' } = useParams<{ orderId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t') ?? ''
  const location = useLocation()
  const placedState = location.state as { justPlaced?: boolean; payment?: OrderPayment | null } | null

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['storefront-order', orderId, token],
    queryFn: () => storefrontApi.orderStatus(orderId, token),
    enabled: Boolean(orderId && token),
    retry: false,
    refetchInterval: (query) => (query.state.data && isFinalStatus(query.state.data.status) ? false : POLL_INTERVAL_MS),
  })

  if (isLoading) {
    return (
      <Shell>
        <div className="h-64 animate-pulse rounded-3xl bg-white ring-1 ring-stone-200" />
      </Shell>
    )
  }
  if (isError || !order) {
    return (
      <Shell>
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
          <p className="text-lg font-semibold text-gray-900">Não achamos esse pedido.</p>
          <p className="mt-2 text-sm text-gray-500">Confira o link ou fale com o restaurante pelo WhatsApp.</p>
          <Link to="/cardapio" className="mt-6 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white">
            Ver cardápio
          </Link>
        </div>
      </Shell>
    )
  }
  return <OrderView order={order} justPlaced={Boolean(placedState?.justPlaced)} />
}

function OrderView({ order, justPlaced }: { order: StorefrontOrderStatus; justPlaced: boolean }) {
  const cancelled = order.status === 'cancelled'
  const awaitingPayment = order.paymentStatus === 'awaiting' && !cancelled
  const steps = statusSteps(order.type)
  const current = currentStepIndex(order.type, order.status)
  const label = order.number ? `#${order.number}` : order.code ?? ''
  const contact = whatsappLink(order.establishment.whatsappNumber, `Olá! Sobre o meu pedido ${label}`)

  useEffect(() => {
    document.title = `Pedido ${label} · ${order.establishment.name}`
  }, [label, order.establishment.name])

  return (
    <Shell>
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
        <div className="bg-brand-700 px-6 py-6 text-white">
          <p className="text-sm text-white/80">{order.establishment.name}</p>
          <h1 className="mt-1 text-2xl font-bold">
            {cancelled ? 'Pedido cancelado' : justPlaced && !awaitingPayment ? 'Pedido enviado!' : `Pedido ${label}`}
          </h1>
          {!cancelled && (
            <p className="mt-1 text-sm text-white/90">
              {justPlaced && !awaitingPayment ? `Número ${label}. ` : ''}
              {order.estimatedAt && !isFinalStatus(order.status) ? `Previsão: ${formatTime(order.estimatedAt)}` : ''}
            </p>
          )}
        </div>

        {awaitingPayment && order.payment && <PaymentBox payment={order.payment} total={order.total} />}
        {!cancelled && order.pixKey && <PixKeyBox pixKey={order.pixKey} total={order.total} />}

        <div className="px-6 py-6">
          {cancelled ? (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <XCircle className="h-5 w-5" /> Este pedido foi cancelado. Se tiver dúvida, fale com a gente.
            </p>
          ) : (
            <ol className="space-y-4">
              {steps.map((step, index) => {
                const done = index < current || (index === current && isFinalStatus(order.status))
                const active = index === current && !isFinalStatus(order.status)
                return (
                  <li key={step.key} className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        done ? 'bg-brand-600 text-white' : active ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : 'bg-stone-100 text-gray-400'
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className={`text-sm ${done || active ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                      {step.label}
                      {active && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="border-t border-stone-100 px-6 py-5">
          <ul className="space-y-2 text-sm">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                <span className="text-gray-700">
                  {item.quantity}× {item.name}
                  {item.notes && <span className="block text-xs italic text-gray-400">{item.notes}</span>}
                </span>
                <span className="tabular-nums text-gray-500">{formatBRL(item.unitPrice * item.quantity)}</span>
              </li>
            ))}
            {order.deliveryFee > 0 && (
              <li className="flex justify-between text-gray-500">
                <span>Entrega</span>
                <span className="tabular-nums">{formatBRL(order.deliveryFee)}</span>
              </li>
            )}
          </ul>
          <p className="mt-3 flex justify-between border-t border-stone-100 pt-3 font-bold text-gray-900">
            <span>Total</span>
            <span className="tabular-nums">{formatBRL(order.total)}</span>
          </p>
          {order.paymentStatus === 'paid' && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Pagamento confirmado
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {contact && (
          <a href={contact} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-semibold text-gray-800 ring-1 ring-stone-200">
            <MessageCircle className="h-4 w-4 text-emerald-600" /> Falar com o restaurante
          </a>
        )}
        <Link to={`/cardapio/${order.establishment.id}`} className="rounded-2xl px-5 py-3 text-center text-sm font-semibold text-brand-700">
          Voltar ao cardápio
        </Link>
      </div>
      <p className="mt-2 text-center text-xs text-gray-400">Esta página se atualiza sozinha. Avisamos também pelo WhatsApp.</p>
    </Shell>
  )
}

function PaymentBox({ payment, total }: { payment: NonNullable<StorefrontOrderStatus['payment']>; total: number }) {
  const [copied, setCopied] = useState(false)
  const expires = formatTime(payment.expiresAt)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  if (payment.pixCopyPaste) {
    return (
      <div className="border-b border-stone-100 bg-brand-50/60 px-6 py-6 text-center">
        <p className="text-sm font-semibold text-gray-900">Pague {formatBRL(total)} com Pix para confirmar</p>
        {expires && <p className="mt-1 text-xs text-gray-500">O código vale até {expires}.</p>}
        <div className="mx-auto mt-4 inline-block rounded-2xl bg-white p-3 ring-1 ring-stone-200">
          <QRCodeSVG value={payment.pixCopyPaste} size={184} />
        </div>
        <button
          type="button"
          onClick={() => void copy(payment.pixCopyPaste ?? '')}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3.5 text-sm font-semibold text-white"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Código copiado' : 'Copiar código Pix'}
        </button>
        <p className="mt-2 text-xs text-gray-500">Assim que o pagamento cair, o pedido vai para a cozinha.</p>
      </div>
    )
  }
  if (payment.paymentUrl) {
    return (
      <div className="border-b border-stone-100 bg-brand-50/60 px-6 py-6 text-center">
        <p className="text-sm font-semibold text-gray-900">Falta pagar {formatBRL(total)}</p>
        {expires && <p className="mt-1 text-xs text-gray-500">O link vale até {expires}.</p>}
        <a
          href={payment.paymentUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3.5 text-sm font-semibold text-white"
        >
          <CreditCard className="h-4 w-4" /> Pagar com cartão
        </a>
      </div>
    )
  }
  return null
}

function PixKeyBox({ pixKey, total }: { pixKey: NonNullable<StorefrontOrderStatus['pixKey']>; total: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="border-b border-stone-100 bg-brand-50/60 px-6 py-5">
      <p className="text-sm font-semibold text-gray-900">Pagamento por Pix: {formatBRL(total)}</p>
      <p className="mt-1 text-xs text-gray-500">Pague na chave abaixo e mande o comprovante pelo WhatsApp do restaurante.</p>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-gray-800">{pixKey.key}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(pixKey.key).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            })
          }}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      {pixKey.holder && <p className="mt-2 text-xs text-gray-500">Em nome de {pixKey.holder}</p>}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-stone-50 px-4 py-8"><div className="mx-auto max-w-md">{children}</div></div>
}
