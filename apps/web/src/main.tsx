import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import App from './App'
import { ApiError } from '@/lib/api'
import { useAccessDeniedStore } from '@/stores/accessDeniedStore'
import './index.css'

const FORBIDDEN = 403

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
