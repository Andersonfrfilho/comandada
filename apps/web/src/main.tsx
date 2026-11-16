import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import App from './App'
import { ApiError } from '@/lib/api'
import { useAccessDeniedStore } from '@/stores/accessDeniedStore'
import { toast } from '@/stores/toastStore'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

const FORBIDDEN = 403
const UPDATE_CHECK_INTERVAL_MS = 60_000

// Sem isso o service worker do PWA servia o bundle antigo do cache: deploy novo só aparecia depois
// de fechar todas as abas (e nunca no app instalado). Agora o app procura versão nova a cada minuto
// e ao voltar para a aba; achou, o service worker novo assume e a página recarrega sozinha.
registerSW({
  immediate: true,
  onRegisteredSW(_scriptUrl, registration) {
    if (!registration) return
    const checkForUpdate = () => {
      if (navigator.onLine) void registration.update()
    }
    setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
  },
})

function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

const queryClient = new QueryClient({
  // Captura o 403 de qualquer query num ponto só, em vez de repetir tratamento
  // em cada página — nenhuma delas olha o erro, todas renderizam `data ?? []`.
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === FORBIDDEN) {
        useAccessDeniedStore.getState().deny()
      }
    },
  }),
  // Toda ação que falha avisa (antes cozinha, pedidos, entregas e caixa engoliam 400/500 e o botão
  // "não fazia nada"). Tela que trata o erro do próprio jeito declara `onError` e fica de fora.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return
      toast.error(error instanceof Error && error.message ? error.message : 'Não deu certo. Tente de novo.')
    },
  }),
  defaultOptions: {
    queries: {
      // Repetir 401/403/404 não muda o resultado e só atrasa a tela.
      retry: (failureCount, error) => !isClientError(error) && failureCount < 1,
      staleTime: 30_000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
