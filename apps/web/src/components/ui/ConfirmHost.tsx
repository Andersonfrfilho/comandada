import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useConfirmStore } from '@/stores/confirmStore'

/** Desenha o `confirmDialog` aberto; montado uma vez no App. */
export function ConfirmHost() {
  const pending = useConfirmStore((state) => state.pending)
  const answer = useConfirmStore((state) => state.answer)
  const [text, setText] = useState('')

  useEffect(() => setText(''), [pending])

  if (!pending) return null
  const minLength = pending.input?.minLength ?? 0
  const textValid = !pending.input || text.trim().length >= minLength

  return (
    <Modal open onClose={() => answer(false)} title={pending.title} size="sm">
      <form
        className="p-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!textValid) return
          answer(pending.input ? text.trim() : true)
        }}
      >
        {pending.message && <p className="text-sm text-gray-600">{pending.message}</p>}
        {pending.input && (
          <div>
            <label htmlFor="confirm-input" className="block text-sm font-medium text-gray-700 mb-1">
              {pending.input.label}
            </label>
            <textarea
              id="confirm-input"
              autoFocus
              rows={3}
              value={text}
              placeholder={pending.input.placeholder}
              onChange={(event) => setText(event.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {minLength > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                {text.trim().length}/{minLength} caracteres no mínimo
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => answer(false)}>
            {pending.cancelLabel ?? 'Voltar'}
          </Button>
          <Button type="submit" variant={pending.tone === 'danger' ? 'danger' : 'primary'} disabled={!textValid} autoFocus={!pending.input}>
            {pending.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
