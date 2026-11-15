import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Hourglass, PackageX, RotateCcw, Send } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { PARTIAL_CONFIRMATION_LABELS as LABELS } from '@/constants/partialConfirmation'
import { formatBrl, totalAfterShortage } from './orderDetailFormat'

export interface OrderItemsCardItem {
  readonly id: string
  readonly productName: string
  readonly unitPrice: string
  readonly quantity: number
  readonly totalPrice: string
  readonly notes: string | null
}

interface PartialSubstituteProduct {
  readonly productId: string
  readonly productName: string
  readonly unitPrice: number
}

export interface OrderPartialConfirmationState {
  readonly status: 'pending' | 'accepted' | 'declined'
  readonly unavailableItemIds: readonly string[]
  readonly substitutions: ReadonlyArray<{ readonly itemId: string; readonly suggested: PartialSubstituteProduct }>
  readonly createdAt: string
  readonly answeredAt: string | null
}

interface SubstitutesResponse {
  readonly items: ReadonlyArray<{
    readonly itemId: string
    readonly substitutes: ReadonlyArray<PartialSubstituteProduct & { readonly catalogName: string | null }>
  }>
}

interface OrderItemsCardProps {
  readonly orderId: string
  readonly items: readonly OrderItemsCardItem[]
  readonly totalAmount: string
  readonly deliveryFee: string | null | undefined
  /** Pedido encerrado não negocia mais itens: os botões somem. */
  readonly canNegotiate: boolean
  readonly customerWhatsappNumber: string | undefined
  readonly partialConfirmation: OrderPartialConfirmationState | null | undefined
}

/**
 * Item marcado como em falta → produto oferecido no lugar. null = só tirar; undefined = a equipe ainda
 * não escolheu, vale a primeira sugestão (a lista pode chegar depois da marcação).
 */
type Shortage = Map<string, string | null | undefined>

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function OrderItemsCard({
  orderId,
  items,
  totalAmount,
  deliveryFee,
  canNegotiate,
  customerWhatsappNumber,
  partialConfirmation,
}: OrderItemsCardProps): JSX.Element {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [shortage, setShortage] = useState<Shortage>(new Map())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resending, setResending] = useState(false)

  const waiting = partialConfirmation?.status === 'pending' && !resending
  const canMark = canNegotiate && Boolean(customerWhatsappNumber) && !waiting

  const substitutesQuery = useQuery({
    queryKey: ['order-substitutes', orderId],
    queryFn: () => api.get<SubstitutesResponse>(`/orders/${orderId}/substitutes`, accessToken ?? undefined),
    // Só busca quando alguém marca o primeiro item em falta.
    enabled: shortage.size > 0,
    staleTime: 60_000,
  })

  const substitutesByItem = useMemo(() => {
    const byItem = new Map<string, readonly (PartialSubstituteProduct & { catalogName: string | null })[]>()
    for (const entry of substitutesQuery.data?.items ?? []) byItem.set(entry.itemId, entry.substitutes)
    return byItem
  }, [substitutesQuery.data])

  function productFor(itemId: string, productId: string | null): PartialSubstituteProduct | null {
    if (!productId) return null
    return substitutesByItem.get(itemId)?.find((product) => product.productId === productId) ?? null
  }

  const effectiveShortage = useMemo(() => {
    const resolved = new Map<string, PartialSubstituteProduct | null>()
    for (const [itemId, productId] of shortage) {
      const chosen = productId === undefined ? substitutesByItem.get(itemId)?.[0] ?? null : productFor(itemId, productId)
      resolved.set(itemId, chosen)
    }
    return resolved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortage, substitutesByItem])

  const sendConfirmation = useMutation({
    mutationFn: () =>
      api.post(
        `/orders/${orderId}/partial-confirmation`,
        {
          unavailableItemIds: [...shortage.keys()],
          substitutions: [...effectiveShortage.entries()]
            .filter((entry): entry is [string, PartialSubstituteProduct] => Boolean(entry[1]))
            .map(([itemId, product]) => ({ itemId, productId: product.productId })),
        },
        accessToken ?? undefined
      ),
    onSuccess: () => {
      setConfirmOpen(false)
      setShortage(new Map())
      setResending(false)
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] })
    },
  })

  function toggleItem(itemId: string): void {
    setShortage((current) => {
      const next = new Map(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.set(itemId, undefined)
      return next
    })
    sendConfirmation.reset()
  }

  function chooseSubstitute(itemId: string, productId: string | null): void {
    setShortage((current) => new Map(current).set(itemId, productId))
  }

  const keptCount = items.filter((item) => !shortage.has(item.id)).length
  const swappedCount = [...effectiveShortage.values()].filter(Boolean).length
  const blockingReason = !customerWhatsappNumber
    ? LABELS.noCustomer
    : shortage.size === 0
      ? LABELS.noneSelected
      : keptCount === 0 && swappedCount === 0
        ? LABELS.allSelected
        : undefined
  const newTotal = totalAfterShortage(items, deliveryFee, effectiveShortage)
  const fee = parseFloat(deliveryFee ?? '0')

  const waitingSubstitutes = new Map(
    (partialConfirmation?.substitutions ?? []).map((substitution) => [substitution.itemId, substitution.suggested])
  )
  const waitingIds = new Set(waiting ? partialConfirmation?.unavailableItemIds ?? [] : [])

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{LABELS.itemsTitle}</h2>
        {waiting && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            <Hourglass className="h-3 w-3" />
            {LABELS.waitingBadge}
          </span>
        )}
      </div>

      {waiting && partialConfirmation && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">{LABELS.waitingTitle}</p>
          <p className="text-xs text-amber-800">{LABELS.waitingSince(formatTime(partialConfirmation.createdAt))}</p>
          {canNegotiate && (
            <button
              type="button"
              onClick={() => setResending(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-900 underline underline-offset-2"
            >
              <RotateCcw className="h-3 w-3" />
              {LABELS.resend}
            </button>
          )}
        </div>
      )}

      {!waiting && partialConfirmation?.answeredAt && partialConfirmation.status === 'accepted' && (
        <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          {LABELS.acceptedNote(formatTime(partialConfirmation.answeredAt))}
        </p>
      )}
      {!waiting && partialConfirmation?.answeredAt && partialConfirmation.status === 'declined' && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {LABELS.declinedNote(formatTime(partialConfirmation.answeredAt))}
        </p>
      )}

      <div className="divide-y divide-gray-100">
        {items.map((item) => {
          const marked = shortage.has(item.id)
          const isWaiting = waitingIds.has(item.id)
          const suggested = isWaiting ? waitingSubstitutes.get(item.id) : undefined
          const substitutes = substitutesByItem.get(item.id) ?? []
          return (
            <div key={item.id} className={`py-2 first:pt-0 ${marked ? '-mx-2 rounded-lg bg-red-50 px-2' : ''}`}>
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className={marked || isWaiting ? 'text-gray-500 line-through' : 'text-gray-800'}>
                    <span className="font-semibold">{item.quantity}×</span> {item.productName}
                  </p>
                  {item.quantity > 1 && <p className="text-xs text-gray-400">{formatBrl(item.unitPrice)} cada</p>}
                  {item.notes && <p className="text-xs text-gray-400 italic">{item.notes}</p>}
                  {isWaiting && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                      <PackageX className="h-3 w-3" />
                      {LABELS.unavailableBadge}
                      {suggested && (
                        <>
                          <ArrowRight className="h-3 w-3" />
                          {LABELS.waitingSuggested(suggested.productName)}
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-gray-600 whitespace-nowrap">{formatBrl(item.totalPrice)}</span>
                  {canMark && (
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                        marked
                          ? 'border-gray-300 text-gray-600 hover:bg-white'
                          : 'border-red-200 text-red-700 hover:bg-red-50'
                      }`}
                    >
                      {marked ? LABELS.undoUnavailable : LABELS.markUnavailable}
                    </button>
                  )}
                </div>
              </div>

              {marked && (
                <label className="mt-2 block text-xs text-gray-600">
                  <span className="mb-1 block font-medium text-gray-700">{LABELS.substituteLabel}</span>
                  {substitutesQuery.isLoading ? (
                    <span className="text-gray-400">{LABELS.substitutesLoading}</span>
                  ) : (
                    <select
                      value={effectiveShortage.get(item.id)?.productId ?? ''}
                      onChange={(event) => chooseSubstitute(item.id, event.target.value || null)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800"
                    >
                      {substitutes.map((product) => (
                        <option key={product.productId} value={product.productId}>
                          {product.productName} · {formatBrl(product.unitPrice)}
                          {product.catalogName ? ` (${product.catalogName})` : ''}
                        </option>
                      ))}
                      <option value="">{LABELS.substituteNone}</option>
                    </select>
                  )}
                  {!substitutesQuery.isLoading && substitutes.length === 0 && (
                    <span className="mt-1 block text-gray-400">{LABELS.substitutesEmpty}</span>
                  )}
                </label>
              )}
            </div>
          )
        })}
      </div>

      <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
        {fee > 0 && (
          <>
            <div className="flex justify-between text-gray-500">
              <dt>Subtotal</dt>
              <dd>{formatBrl(parseFloat(totalAmount) - fee)}</dd>
            </div>
            <div className="flex justify-between text-gray-500">
              <dt>Taxa de entrega</dt>
              <dd>{formatBrl(fee)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between font-semibold text-gray-900">
          <dt>Total</dt>
          <dd className={shortage.size > 0 ? 'text-gray-400 line-through font-normal' : ''}>{formatBrl(totalAmount)}</dd>
        </div>
        {shortage.size > 0 && (
          <div className="flex justify-between font-semibold text-brand-700">
            <dt>{LABELS.newTotal}</dt>
            <dd>{formatBrl(newTotal)}</dd>
          </div>
        )}
      </dl>

      {shortage.size > 0 && (
        <div className="mt-3 space-y-2">
          {blockingReason && <p className="text-xs text-gray-500">{blockingReason}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShortage(new Map())
                setResending(false)
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {LABELS.clear}
            </button>
            <button
              type="button"
              disabled={Boolean(blockingReason) || substitutesQuery.isLoading}
              onClick={() => setConfirmOpen(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Send className="h-4 w-4" />
              {LABELS.submit} · {LABELS.pendingSummary(shortage.size)}
            </button>
          </div>
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={LABELS.modalTitle} size="md">
        <div className="p-5 space-y-3">
          <p className="text-sm text-amber-800 bg-amber-50 rounded px-3 py-2">{LABELS.modalWarning}</p>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">{LABELS.modalPreviewTitle}</p>
            <ul className="text-sm text-gray-800 space-y-1">
              {items
                .filter((item) => shortage.has(item.id))
                .map((item) => {
                  const substitute = effectiveShortage.get(item.id)
                  return (
                    <li key={item.id}>
                      <span className="line-through text-gray-500">
                        {item.quantity}× {item.productName}
                      </span>
                      {substitute ? (
                        <span className="text-gray-900">
                          {' '}
                          → {substitute.productName} ({formatBrl(substitute.unitPrice)})
                        </span>
                      ) : (
                        <span className="text-gray-500"> (sem troca)</span>
                      )}
                    </li>
                  )
                })}
            </ul>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {LABELS.newTotal}: {formatBrl(newTotal)}
            </p>
          </div>

          {sendConfirmation.isError && (
            <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2">
              {sendConfirmation.error instanceof Error ? sendConfirmation.error.message : LABELS.sendFailure}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {LABELS.modalCancel}
            </button>
            <button
              type="button"
              disabled={sendConfirmation.isPending}
              onClick={() => sendConfirmation.mutate()}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:bg-gray-300"
            >
              {sendConfirmation.isPending ? LABELS.sending : LABELS.modalConfirm}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
