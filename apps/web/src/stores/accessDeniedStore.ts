import { create } from 'zustand'

interface AccessDeniedState {
  isDenied: boolean
  deny(): void
  clear(): void
}

/**
 * Um 403 vindo de qualquer query precisa aparecer na tela. Sem isso a página
 * renderiza `data ?? []` e o usuário lê "0 cadastrados" como se o cadastro
 * estivesse vazio, quando na verdade lhe faltou permissão.
 */
export const useAccessDeniedStore = create<AccessDeniedState>()((set) => ({
  isDenied: false,
  deny: () => set({ isDenied: true }),
  clear: () => set({ isDenied: false }),
}))
