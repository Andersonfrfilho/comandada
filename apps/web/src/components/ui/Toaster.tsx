import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToastStore, type ToastTone } from '@/stores/toastStore'

const TONE_STYLES: Record<ToastTone, { box: string; icon: typeof Info }> = {
  success: { box: 'border-green-200 bg-green-50 text-green-900', icon: CheckCircle2 },
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: XCircle },
  info: { box: 'border-brand-200 bg-white text-gray-900', icon: Info },
}

/** Pilha de avisos no topo (celular) ou canto inferior direito (desktop). */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-16 z-[60] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:w-96"
    >
      {toasts.map((item) => {
        const style = TONE_STYLES[item.tone]
        const Icon = style.icon
        return (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${style.box}`}
          >
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <p className="flex-1">{item.message}</p>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Fechar aviso" className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
