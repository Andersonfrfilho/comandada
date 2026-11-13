import { useEffect, useState, type ReactNode } from 'react'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export type ModalProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly title?: string
  readonly size?: ModalSize
  readonly closeOnBackdrop?: boolean
  readonly children: ReactNode
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
}

const TRANSITION_MS = 150

export function Modal({ open, onClose, title, size = 'md', closeOnBackdrop = true, children }: ModalProps): JSX.Element | null {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }
    setVisible(false)
    const timeout = setTimeout(() => setMounted(false), TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 transition-opacity motion-reduce:transition-none duration-150 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`bg-white rounded-2xl w-full ${SIZE_CLASS[size]} max-h-[95vh] flex flex-col shadow-2xl transition-all motion-reduce:transition-none duration-150 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors">
              ×
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">{children}</div>
      </div>
    </div>
  )
}
