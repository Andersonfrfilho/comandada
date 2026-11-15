import { create } from 'zustand'

export interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  /** Pede um texto (ex.: justificativa) antes de confirmar; a resposta volta no lugar de `true`. */
  input?: { label: string; minLength?: number; placeholder?: string }
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (answer: string | boolean) => void
}

interface ConfirmState {
  pending: PendingConfirm | null
  open(request: ConfirmRequest): Promise<string | boolean>
  answer(value: string | boolean): void
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  pending: null,
  open(request) {
    // Um pedido em aberto que não foi respondido conta como "cancelar".
    get().pending?.resolve(false)
    return new Promise((resolve) => set({ pending: { ...request, resolve } }))
  },
  answer(value) {
    const current = get().pending
    set({ pending: null })
    current?.resolve(value)
  },
}))

/**
 * Confirmação no estilo do painel no lugar de `window.confirm`/`prompt` (que travam a aba, não seguem
 * a marca e somem em alguns navegadores). Responde `true`/`false`, ou o texto digitado quando há `input`.
 */
export function confirmDialog(request: ConfirmRequest & { input?: undefined }): Promise<boolean>
export function confirmDialog(request: ConfirmRequest & { input: NonNullable<ConfirmRequest['input']> }): Promise<string | null>
export async function confirmDialog(request: ConfirmRequest): Promise<boolean | string | null> {
  const answer = await useConfirmStore.getState().open(request)
  if (request.input) return typeof answer === 'string' ? answer : null
  return answer === true
}
