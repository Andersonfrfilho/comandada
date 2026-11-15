import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastState {
  toasts: Toast[]
  show(tone: ToastTone, message: string): void
  dismiss(id: number): void
}

const TOAST_DURATION_MS: Record<ToastTone, number> = { success: 3500, info: 6000, error: 7000 }
const MAX_TOASTS = 4

let nextId = 1

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show(tone, message) {
    // A mesma mensagem duas vezes seguidas (dois cliques, duas queries) vira um aviso só.
    if (get().toasts.some((toast) => toast.message === message && toast.tone === tone)) return
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }].slice(-MAX_TOASTS) }))
    setTimeout(() => get().dismiss(id), TOAST_DURATION_MS[tone])
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
}))

/** Avisos curtos no canto da tela; usar fora de componentes também (ex.: cache do react-query). */
export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
  info: (message: string) => useToastStore.getState().show('info', message),
}
