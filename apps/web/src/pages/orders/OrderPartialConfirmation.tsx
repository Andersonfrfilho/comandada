import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { PackageX } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { PARTIAL_CONFIRMATION_LABELS } from '@/constants/partialConfirmation'

export interface PartialConfirmationItem {
  readonly id: string
  readonly productName: string
  readonly quantity: number
}

export interface OrderPartialConfirmationProps {
  readonly orderId: string
  readonly items: readonly PartialConfirmationItem[]
  /** Sem número não há para quem enviar; a seção aparece explicando, em vez de sumir sem motivo. */
  readonly customerWhatsappNumber: string | undefined
}

interface PartialConfirmationResponse {
  readonly message: string
  readonly whatsappNumber: string
}

export function OrderPartialConfirmation({
  orderId,
  items,
  customerWhatsappNumber,
}: OrderPartialConfirmationProps): JSX.Element {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [selecting, setSelecting] = useState(false)
  const [unavailableIds, setUnavailableIds] = useState<ReadonlySet<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const sendConfirmation = useMutation({
    mutationFn: () =>
      api.post<PartialConfirmationResponse>(
        `/orders/${orderId}/partial-confirmation`,
        { unavailableItemIds: [...unavailableIds] },
        accessToken ?? undefined
      ),
    onSuccess: () => {
      setConfirmOpen(false)
      setSelecting(false)
      setUnavailableIds(new Set())
    },
  })

  const unavailableItems = items.filter((item) => unavailableIds.has(item.id))
  const allSelected = unavailableIds.size === items.length
  const blockingReason = !customerWhatsappNumber
    ? PARTIAL_CONFIRMATION_LABELS.noCustomer
    : unavailableIds.size === 0
      ? PARTIAL_CONFIRMATION_LABELS.noneSelected
      : allSelected
        ? PARTIAL_CONFIRMATION_LABELS.allSelected
        : undefined

  function handleToggleItem(itemId: string): void {
    setUnavailableIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function handleCancelSelecting(): void {
    setSelecting(false)
    setUnavailableIds(new Set())
    sendConfirmation.reset()
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <PackageX className="h-4 w-4 text-gray-400" />
          {PARTIAL_CONFIRMATION_LABELS.sectionTitle}
        </h2>
        <button
          type="button"
          onClick={() => (selecting ? handleCancelSelecting() : setSelecting(true))}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          {selecting
            ? PARTIAL_CONFIRMATION_LABELS.cancelSelecting
            : PARTIAL_CONFIRMATION_LABELS.startSelecting}
        </button>
      </div>

      {sendConfirmation.isSuccess && !selecting && (
        <p className="text-sm text-green-700 bg-green-50 rounded px-2 py-1">
          {PARTIAL_CONFIRMATION_LABELS.sent}
        </p>
      )}

      {selecting && (
        <>
          <p className="text-xs text-gray-500 mb-3">{PARTIAL_CONFIRMATION_LABELS.selectHint}</p>

          <div className="space-y-2 mb-3">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={unavailableIds.has(item.id)}
                  onChange={() => handleToggleItem(item.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {item.quantity}× {item.productName}
              </label>
            ))}
          </div>

          {blockingReason && <p className="text-xs text-gray-400 mb-2">{blockingReason}</p>}

          <button
            type="button"
            disabled={Boolean(blockingReason)}
            onClick={() => setConfirmOpen(true)}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            {PARTIAL_CONFIRMATION_LABELS.submit}
          </button>
        </>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={PARTIAL_CONFIRMATION_LABELS.modalTitle}
        size="md"
      >
        <div className="p-5 space-y-3">
          <p className="text-sm text-amber-800 bg-amber-50 rounded px-3 py-2">
            {PARTIAL_CONFIRMATION_LABELS.modalWarning}
          </p>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">
              {PARTIAL_CONFIRMATION_LABELS.modalPreviewTitle}
            </p>
            <ul className="text-sm text-gray-800 space-y-0.5">
              {unavailableItems.map((item) => (
                <li key={item.id}>
                  {item.quantity}× {item.productName}
                </li>
              ))}
            </ul>
          </div>

          {sendConfirmation.isError && (
            <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2">
              {sendConfirmation.error instanceof Error
                ? sendConfirmation.error.message
                : PARTIAL_CONFIRMATION_LABELS.sendFailure}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {PARTIAL_CONFIRMATION_LABELS.modalCancel}
            </button>
            <button
              type="button"
              disabled={sendConfirmation.isPending}
              onClick={() => sendConfirmation.mutate()}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:bg-gray-300"
            >
              {sendConfirmation.isPending
                ? PARTIAL_CONFIRMATION_LABELS.sending
                : PARTIAL_CONFIRMATION_LABELS.modalConfirm}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
