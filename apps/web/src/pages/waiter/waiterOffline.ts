import { useEffect, useState, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { getApiUrl } from '@/lib/apiEndpoints'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'

/*
 * Estratégia de dados do app do garçom ("mostra o que tem, atualiza por trás, guarda o que não deu
 * para enviar"):
 *
 *  1. Leitura: mesas, cardápio e contas abertas ficam salvos no aparelho. O app abre na hora com o
 *     que tinha e o React Query busca de novo em seguida (stale-while-revalidate). Sem rede, a tela
 *     continua com a última versão e mostra de quando ela é.
 *  2. Escrita: lançar pedido e pedir a conta vão para uma fila no aparelho quando o servidor não
 *     responde, e saem sozinhos quando a conexão volta. O pedido leva um id gerado aqui, então
 *     reenviar nunca lança duas vezes na cozinha (a API devolve o que já gravou).
 *  3. Abrir comanda precisa do servidor (o código e o id vêm de lá): sem conexão, o app avisa.
 */

const CACHE_VERSION = 1
const MAX_BILLS = 30
/** Dado salvo mais velho que isso não aparece: melhor a tela de carregando do que mesa de ontem. */
const MAX_CACHE_AGE_MS = 12 * 60 * 60 * 1000
const FLUSH_INTERVAL_MS = 15_000

interface CachedQuery {
  key: QueryKey
  data: unknown
  updatedAt: number
}

interface CacheFile {
  version: number
  queries: CachedQuery[]
}

function cacheStorageKey(establishmentId: string, userId: string): string {
  return `waiter-cache:${establishmentId}:${userId}`
}

/** Só o que o garçom precisa para trabalhar sem rede; busca de cliente e o resto ficam de fora. */
export function isPersistedQueryKey(key: QueryKey): boolean {
  const [head, second] = key
  if (head === 'tables' || head === 'menu') return key.length === 1
  return head === 'comanda-bill' && typeof second === 'string' && key.length === 2
}

/** Mantém as contas mais recentes (até `MAX_BILLS`) e descarta o que passou da validade. */
export function pruneCachedQueries(queries: CachedQuery[], now: number): CachedQuery[] {
  const fresh = queries.filter((query) => now - query.updatedAt <= MAX_CACHE_AGE_MS)
  const bills = fresh
    .filter((query) => query.key[0] === 'comanda-bill')
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_BILLS)
  return [...fresh.filter((query) => query.key[0] !== 'comanda-bill'), ...bills]
}

function readCache(storageKey: string): CachedQuery[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CacheFile
    return parsed.version === CACHE_VERSION && Array.isArray(parsed.queries) ? parsed.queries : []
  } catch {
    return []
  }
}

function writeCache(storageKey: string, queries: CachedQuery[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: CACHE_VERSION, queries } satisfies CacheFile))
  } catch {
    // Aparelho sem espaço ou modo privado: segue sem guardar.
  }
}

function hydrate(queryClient: QueryClient, storageKey: string): void {
  for (const cached of pruneCachedQueries(readCache(storageKey), Date.now())) {
    // Não sobrescreve o que já chegou da rede nesta sessão.
    const current = queryClient.getQueryState(cached.key)
    if (current?.dataUpdatedAt && current.dataUpdatedAt >= cached.updatedAt) continue
    queryClient.setQueryData(cached.key, cached.data, { updatedAt: cached.updatedAt })
  }
}

function snapshot(queryClient: QueryClient): CachedQuery[] {
  return pruneCachedQueries(
    queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => isPersistedQueryKey(query.queryKey) && query.state.data !== undefined)
      .map((query) => ({ key: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt })),
    Date.now()
  )
}

/**
 * Liga o cache do aparelho: carrega o que tinha antes de a primeira tela buscar e salva a cada
 * resposta nova (agrupado, para não escrever no armazenamento a cada render).
 */
export function useWaiterPersistedCache(): void {
  const queryClient = useQueryClient()
  const establishmentId = useAuthStore((state) => state.user?.establishmentId)
  const userId = useAuthStore((state) => state.user?.id)
  const storageKey = establishmentId && userId ? cacheStorageKey(establishmentId, userId) : null

  // Carrega já no primeiro render (antes dos useQuery das telas), não num efeito depois deles.
  useState(() => {
    if (storageKey) hydrate(queryClient, storageKey)
    return true
  })

  useEffect(() => {
    if (!storageKey) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return
      if (!isPersistedQueryKey(event.query.queryKey)) return
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        writeCache(storageKey, snapshot(queryClient))
      }, 1_000)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [queryClient, storageKey])
}

/** Apaga o cache do aparelho ao sair: o próximo garçom não vê a mesa do anterior. */
export function clearWaiterDeviceData(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (key?.startsWith('waiter-cache:') || key?.startsWith('waiter-cart:')) localStorage.removeItem(key)
    }
  } catch {
    // Sem armazenamento: nada para apagar.
  }
  useWaiterOutboxStore.getState().clear()
}

// ── Conexão ──────────────────────────────────────────────────────────────────────────────────────

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/**
 * Com loja e nuvem, a comanda aberta num servidor leva alguns segundos para chegar no outro: um 404
 * logo depois de lançar é atraso da sincronização, não recusa. Passou disso, o garçom decide.
 */
const SYNC_GRACE_MS = 5 * 60 * 1000

export function isRetryableForQueue(error: unknown, createdAt: string, now = Date.now()): boolean {
  if (isRetryableError(error)) return true
  return error instanceof ApiError && error.status === 404 && now - Date.parse(createdAt) < SYNC_GRACE_MS
}

/** Falha de rede (sem resposta, servidor fora, tempo esgotado): vale tentar de novo depois. */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
}

// ── Fila de envio ────────────────────────────────────────────────────────────────────────────────

export type OutboxKind = 'order' | 'request-bill'

export interface OutboxEntry {
  id: string
  kind: OutboxKind
  path: string
  body: unknown
  /** Comanda a que a ação pertence: a tela da comanda mostra o que está esperando. */
  comandaId: string
  /** "2 itens · R$ 64,00" para a lista de pendentes. */
  label: string
  total: number
  createdAt: string
  attempts: number
  /** Servidor recusou (4xx): não adianta reenviar; o garçom decide descartar. */
  rejected: string | null
}

/** Evento já entregue: o que saiu, para qual servidor e quando (últimos 30, para conferir na tela). */
export interface SentEvent {
  id: string
  kind: OutboxKind
  label: string
  server: string
  queued: boolean
  sentAt: string
}

const MAX_SENT_EVENTS = 30

interface OutboxState {
  entries: OutboxEntry[]
  sent: SentEvent[]
  recordSent(event: Omit<SentEvent, 'sentAt'>): void
  discard(id: string): void
  /** Recusado que o garçom quer tentar de novo (ex.: corrigiu a comanda no painel). */
  retry(id: string): void
  enqueue(entry: Omit<OutboxEntry, 'createdAt' | 'attempts' | 'rejected'>): void
  remove(id: string): void
  markAttempt(id: string, rejected: string | null): void
  clear(): void
}

export const useWaiterOutboxStore = create<OutboxState>()(
  persist(
    (set) => ({
      entries: [],
      sent: [],
      recordSent: (event) =>
        set((state) => ({
          sent: [{ ...event, sentAt: new Date().toISOString() }, ...state.sent.filter((existing) => existing.id !== event.id)].slice(
            0,
            MAX_SENT_EVENTS
          ),
        })),
      retry: (id) =>
        set((state) => ({ entries: state.entries.map((entry) => (entry.id === id ? { ...entry, rejected: null } : entry)) })),
      discard: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      enqueue: (entry) =>
        set((state) =>
          state.entries.some((existing) => existing.id === entry.id)
            ? state
            : { entries: [...state.entries, { ...entry, createdAt: new Date().toISOString(), attempts: 0, rejected: null }] }
        ),
      remove: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      markAttempt: (id, rejected) =>
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id ? { ...entry, attempts: entry.attempts + 1, rejected } : entry
          ),
        })),
      clear: () => set({ entries: [], sent: [] }),
    }),
    { name: 'waiter-outbox' }
  )
)

let flushing: Promise<void> | null = null

/**
 * Envia a fila na ordem em que foi lançada. Para no primeiro erro de rede (o resto também não iria);
 * recusa do servidor marca a entrada e segue para a próxima.
 */
export function flushOutbox(queryClient: QueryClient): Promise<void> {
  if (!navigator.onLine) return Promise.resolve()
  flushing ??= (async () => {
    const token = useAuthStore.getState().accessToken ?? undefined
    let sent = 0
    for (const entry of useWaiterOutboxStore.getState().entries) {
      if (entry.rejected) continue
      try {
        await api.post(entry.path, entry.body, token)
        useWaiterOutboxStore.getState().remove(entry.id)
        useWaiterOutboxStore.getState().recordSent({ id: entry.id, kind: entry.kind, label: entry.label, server: getApiUrl(), queued: true })
        sent++
        void queryClient.invalidateQueries({ queryKey: ['comanda-bill', entry.comandaId] })
      } catch (error) {
        if (isRetryableForQueue(error, entry.createdAt)) {
          useWaiterOutboxStore.getState().markAttempt(entry.id, null)
          break
        }
        useWaiterOutboxStore.getState().markAttempt(entry.id, error instanceof Error ? error.message : 'Recusado pelo servidor')
        toast.error(`Não deu para enviar: ${entry.label}`)
      }
    }
    if (sent > 0) {
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      toast.success(sent === 1 ? 'Lançamento pendente enviado' : `${sent} lançamentos pendentes enviados`)
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

/** Tenta esvaziar a fila ao abrir, quando a rede volta e a cada 15 s enquanto houver pendência. */
export function useOutboxSync(): void {
  const queryClient = useQueryClient()
  const pending = useWaiterOutboxStore((state) => state.entries.some((entry) => !entry.rejected))
  const accessToken = useAuthStore((state) => state.accessToken)

  useEffect(() => {
    if (!pending || !accessToken) return
    void flushOutbox(queryClient)
    const onOnline = () => void flushOutbox(queryClient)
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => void flushOutbox(queryClient), FLUSH_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
    }
  }, [pending, accessToken, queryClient])
}

/**
 * Envia agora; se o servidor não responder, guarda na fila e devolve `queued`. Recusa do servidor
 * (dado inválido, comanda fechada) volta como erro para a tela mostrar.
 */
export async function sendOrQueue(
  entry: Omit<OutboxEntry, 'createdAt' | 'attempts' | 'rejected'>
): Promise<{ queued: boolean; result?: unknown }> {
  const token = useAuthStore.getState().accessToken ?? undefined
  if (!navigator.onLine) {
    useWaiterOutboxStore.getState().enqueue(entry)
    return { queued: true }
  }
  try {
    const result = await api.post(entry.path, entry.body, token)
    useWaiterOutboxStore.getState().recordSent({ id: entry.id, kind: entry.kind, label: entry.label, server: getApiUrl(), queued: false })
    return { queued: false, result }
  } catch (error) {
    if (!isRetryableError(error)) throw error
    useWaiterOutboxStore.getState().enqueue(entry)
    return { queued: true }
  }
}
