import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { DISPLAY_FONT } from './storefrontTheme'

/** Folha que sobe de baixo no celular e vira janela centrada no computador. */
export function BottomSheet({
  title,
  onClose,
  children,
  fullHeight = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  fullHeight?: boolean
}) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_160ms_ease-out]" />
      <div
        className={`relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[#fff4e8] shadow-2xl sm:rounded-3xl animate-[sheetUp_220ms_cubic-bezier(.2,.8,.2,1)] ${
          fullHeight ? 'h-[94dvh] sm:h-[88vh]' : 'max-h-[90dvh]'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#f0e2cf] bg-white px-5 py-4">
          <h2 className={`truncate text-xl font-semibold text-[#1c120d] ${DISPLAY_FONT}`}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pt-4">{children}</div>
      </div>
      <style>{`
        @keyframes sheetUp { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { [class*="animate-["] { animation: none !important } }
      `}</style>
    </div>
  )
}
