import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useAuthStore, useCan } from '@/stores/authStore'
import { api } from '@/lib/api'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { formatBRL, formatDateTime } from '@/lib/listing'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  DISPUTE_KIND_LABELS,
  DISPUTE_STATUS_LABELS,
  PLATFORM_STATUS_LABELS,
  marketplaceOrderQueryKey,
  timeLeftLabel,
  type MarketplaceCancellationReason,
  type MarketplaceDisputeResponse,
  type MarketplaceDisputeView,
  type MarketplaceOrderView,
} from '@/lib/marketplaces'

interface MarketplaceOrderCardProps {
  orderId: string
  orderClosed: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Não deu certo agora. Tente de novo.'
}

/** Relógio de 1 s só enquanto houver prazo correndo na tela. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

/**
 * Pedido de iFood/99Food: o que a plataforma sabe, negociações do cliente (com prazo) e o cancelamento
 * com o motivo que a plataforma aceita. O pedido só fecha aqui quando a plataforma confirma.
 */
export function MarketplaceOrderCard({ orderId, orderClosed }: MarketplaceOrderCardProps) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const queryClient = useQueryClient()
  const canWrite = useCan({ resource: 'orders', action: 'write' })
  const queryKey = marketplaceOrderQueryKey(orderId)

  const { data } = useQuery({
    queryKey,
    queryFn: () => api.get<{ marketplace: MarketplaceOrderView | null }>(`/marketplaces/orders/${orderId}`, accessToken),
  })
  const marketplace = data?.marketplace ?? null

  useWebSocket((message) => {
    if (message.type.startsWith('marketplace:') || message.type.startsWith('order:')) void queryClient.invalidateQueries({ queryKey })
  })

  const openDisputes = marketplace?.disputes.filter((dispute) => dispute.status === 'open') ?? []
  const now = useNow(openDisputes.length > 0)
  const [cancelOpen, setCancelOpen] = useState(false)

  if (!marketplace) return null
  const canAct = canWrite && marketplace.connected
  const cancelRequested = marketplace.platformStatus === 'cancellation_requested'
  const platformClosed = marketplace.platformStatus === 'cancelled' || marketplace.platformStatus === 'concluded'

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">
          {marketplace.label} {marketplace.displayId ? `#${marketplace.displayId}` : ''}
        </h2>
        <span className="text-xs font-medium text-gray-600">
          No {marketplace.label}: {PLATFORM_STATUS_LABELS[marketplace.platformStatus] ?? marketplace.platformStatus}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {marketplace.deliveredBy === 'merchant' ? 'Entrega ou retirada com a loja' : `Entregador do ${marketplace.label}`}
        {!marketplace.connected ? ` · integração desligada: cancele e responda pelo portal do ${marketplace.label}` : ''}
      </p>

      {marketplace.disputes.length > 0 && (
        <div className="mt-3 space-y-3">
          {marketplace.disputes.map((dispute) => (
            <DisputeBox key={dispute.id} dispute={dispute} now={now} canAct={canAct} orderId={orderId} />
          ))}
        </div>
      )}

      {canAct && !orderClosed && !platformClosed && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {cancelRequested ? (
            <p className="text-xs text-amber-700">
              Cancelamento pedido. O pedido fecha aqui quando o {marketplace.label} confirmar.
            </p>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
              Cancelar no {marketplace.label}
            </Button>
          )}
        </div>
      )}

      {cancelOpen && (
        <CancelOnPlatformModal
          orderId={orderId}
          label={marketplace.label}
          onClose={() => setCancelOpen(false)}
          onDone={() => {
            setCancelOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['order', orderId] })
          }}
        />
      )}
    </section>
  )
}

function CancelOnPlatformModal({
  orderId,
  label,
  onClose,
  onDone,
}: {
  orderId: string
  label: string
  onClose: () => void
  onDone: () => void
}) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const [code, setCode] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const reasons = useQuery({
    queryKey: ['order', orderId, 'marketplace', 'cancellation-reasons'],
    queryFn: () =>
      api.get<{ reasons: MarketplaceCancellationReason[] }>(`/marketplaces/orders/${orderId}/cancellation-reasons`, accessToken),
    staleTime: 0,
  })

  const cancel = useMutation({
    mutationFn: () => {
      const chosen = reasons.data?.reasons.find((item) => item.code === code)
      return api.post(`/marketplaces/orders/${orderId}/cancel`, { code, reason: reason.trim() || chosen?.description || 'Cancelado pela loja' }, accessToken)
    },
    onSuccess: () => {
      toast.success(`Cancelamento enviado ao ${label}`)
      onDone()
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const options = (reasons.data?.reasons ?? []).map((item) => ({ value: item.code, label: item.description }))
  const empty = reasons.isSuccess && options.length === 0

  return (
    <Modal open onClose={onClose} title={`Cancelar no ${label}`} size="md">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          O {label} decide o cancelamento. O pedido continua aberto aqui até a confirmação; se ele recusar, você recebe o aviso.
        </p>
        {reasons.isLoading && <p className="text-sm text-gray-500">Buscando os motivos aceitos…</p>}
        {reasons.isError && <p className="text-sm text-red-700">{errorText(reasons.error)}</p>}
        {empty && (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            O {label} não aceita mais cancelamento pela loja neste pedido. Resolva pelo portal ou pelo suporte da plataforma.
          </p>
        )}
        {options.length > 0 && (
          <>
            <Select
              options={options}
              value={code}
              onChange={setCode}
              placeholder="Escolha o motivo"
              title="Motivo do cancelamento"
              ariaLabel="Motivo do cancelamento"
            />
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={250}
              rows={3}
              placeholder="Explique para o cliente (opcional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="danger" disabled={!code} loading={cancel.isPending} loadingLabel="Enviando…" onClick={() => cancel.mutate()}>
            Pedir cancelamento
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DisputeBox({ dispute, now, canAct, orderId }: { dispute: MarketplaceDisputeView; now: number; canAct: boolean; orderId: string }) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'reject' | 'alternative' | null>(null)
  const [reason, setReason] = useState('')
  const [alternativeId, setAlternativeId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [minutes, setMinutes] = useState<string | null>(null)

  const respond = useMutation({
    mutationFn: (response: MarketplaceDisputeResponse) => api.post(`/marketplaces/disputes/${dispute.id}/respond`, response, accessToken),
    onSuccess: () => {
      toast.success('Resposta enviada')
      setMode(null)
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['marketplace-disputes'] })
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const status = DISPUTE_STATUS_LABELS[dispute.status] ?? { label: dispute.status, className: 'bg-gray-100 text-gray-700' }
  const timeLeft = dispute.status === 'open' ? timeLeftLabel(dispute.expiresAt, now) : null
  const open = dispute.status === 'open' && canAct
  const alternatives = dispute.dispute.alternatives
  const chosen = alternatives.find((alternative) => alternative.id === alternativeId)

  function sendAlternative() {
    if (!chosen) return
    if (chosen.type === 'refund') {
      const value = Number(amount.replace(',', '.'))
      if (!Number.isFinite(value) || value <= 0) return toast.error('Informe o valor do reembolso')
      if (chosen.maxAmount !== undefined && value > chosen.maxAmount) return toast.error(`O máximo é ${formatBRL(chosen.maxAmount)}`)
      respond.mutate({ decision: 'alternative', alternativeId: chosen.id, amount: value })
      return
    }
    if (chosen.type === 'additional_time') {
      if (!minutes) return toast.error('Escolha quantos minutos')
      respond.mutate({ decision: 'alternative', alternativeId: chosen.id, minutes: Number(minutes), reason: chosen.reasons?.[0] })
      return
    }
    respond.mutate({ decision: 'alternative', alternativeId: chosen.id })
  }

  return (
    <div className={`rounded-lg border p-3 ${dispute.status === 'open' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          {dispute.status === 'open' && <AlertTriangle className="h-4 w-4 text-amber-600" />}
          {DISPUTE_KIND_LABELS[dispute.kind] ?? dispute.kind}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
      </div>
      {dispute.message && <p className="mt-1 text-sm text-gray-700">“{dispute.message}”</p>}
      {(dispute.dispute.items ?? []).length > 0 && (
        <ul className="mt-1 text-xs text-gray-600">
          {dispute.dispute.items!.map((item, index) => (
            <li key={index}>
              {item.quantity ? `${item.quantity}x ` : ''}
              {item.name ?? 'Item'}
              {item.amount !== undefined ? ` · ${formatBRL(item.amount)}` : ''}
              {item.reason ? ` · ${item.reason}` : ''}
            </li>
          ))}
        </ul>
      )}
      {(dispute.dispute.evidenceUrls ?? []).length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {dispute.dispute.evidenceUrls!.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600">
              Foto {index + 1} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-gray-500">
        Aberta em {formatDateTime(dispute.createdAt)}
        {timeLeft ? ` · responda em ${timeLeft}` : ''}
        {dispute.status === 'open' && dispute.dispute.timeoutAction ? ` · ${timeoutText(dispute.dispute.timeoutAction)}` : ''}
      </p>

      {open && mode === null && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" loading={respond.isPending} onClick={() => respond.mutate({ decision: 'accept' })}>
            Aceitar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('reject')}>
            Recusar
          </Button>
          {alternatives.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setMode('alternative')}>
              Fazer proposta
            </Button>
          )}
        </div>
      )}

      {open && mode === 'reject' && (
        <div className="mt-2 space-y-2">
          {(dispute.dispute.reasons ?? []).length > 0 && (
            <Select
              options={dispute.dispute.reasons!.map((item) => ({ value: item, label: item }))}
              value={reason || null}
              onChange={setReason}
              placeholder="Motivo"
              title="Motivo da recusa"
              ariaLabel="Motivo da recusa"
            />
          )}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={250}
            rows={2}
            placeholder="Por que a loja recusa? (o cliente vê)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setMode(null)}>
              Voltar
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={respond.isPending}
              onClick={() => respond.mutate({ decision: 'reject', reason: reason.trim() })}
            >
              Enviar recusa
            </Button>
          </div>
        </div>
      )}

      {open && mode === 'alternative' && (
        <div className="mt-2 space-y-2">
          <Select
            options={alternatives.map((alternative) => ({
              value: alternative.id,
              label:
                alternative.type === 'refund'
                  ? `Reembolso parcial${alternative.maxAmount !== undefined ? ` (até ${formatBRL(alternative.maxAmount)})` : ''}`
                  : alternative.type === 'additional_time'
                    ? 'Mais tempo para entregar'
                    : 'Outra proposta',
            }))}
            value={alternativeId}
            onChange={setAlternativeId}
            placeholder="Escolha a proposta"
            title="Proposta"
            ariaLabel="Proposta"
          />
          {chosen?.type === 'refund' && (
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Valor em R$"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          )}
          {chosen?.type === 'additional_time' && (
            <Select
              options={(chosen.minutes ?? []).map((value) => ({ value: String(value), label: `${value} min` }))}
              value={minutes}
              onChange={setMinutes}
              placeholder="Minutos"
              title="Mais tempo"
              ariaLabel="Minutos a mais"
            />
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setMode(null)}>
              Voltar
            </Button>
            <Button size="sm" disabled={!chosen} loading={respond.isPending} onClick={sendAlternative}>
              Enviar proposta
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const TIMEOUT_TEXTS: Record<string, string> = {
  ACCEPT_CANCELLATION: 'sem resposta, o cancelamento é aceito',
  ACCEPT_REFUND: 'sem resposta, o reembolso é aceito',
  REJECT_CANCELLATION: 'sem resposta, o cancelamento é recusado',
}

function timeoutText(value: string): string {
  return TIMEOUT_TEXTS[value] ?? value.charAt(0).toLowerCase() + value.slice(1)
}
