import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useQueryClient } from '@tanstack/react-query'
import { API_URL, setApiServerOverride } from '@/lib/apiEndpoints'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { isWaiterPath } from './waiterModel'

/*
 * Dois servidores para o garçom: o da loja (rede local, responde mesmo sem internet) e o da nuvem.
 * Loja e nuvem se sincronizam a cada 5 s, então tanto faz por qual o pedido entra. O app mede os
 * dois a cada poucos segundos e usa a loja quando ela responde; senão, a nuvem; sem nenhum, a fila
 * do celular (`waiterOffline.ts`) guarda tudo até um voltar.
 *
 * Cada servidor tem a própria sessão (o login é feito nos dois com a mesma conta, que a
 * sincronização copia), e trocar de servidor troca o token ativo do `authStore`.
 */

export type ServerKind = 'loja' | 'nuvem'
export type ServerMode = 'auto' | ServerKind

export const SERVER_KINDS: readonly ServerKind[] = ['loja', 'nuvem']
export const SERVER_LABELS: Record<ServerKind, string> = { loja: 'Servidor da loja', nuvem: 'Nuvem' }

const HEALTH_TIMEOUT_MS = 2_500
const HEALTH_INTERVAL_MS = 10_000
/** Com o servidor em uso fora do ar, mede mais vezes para voltar logo. */
const HEALTH_INTERVAL_DOWN_MS = 4_000

export interface ServerSession {
  accessToken: string | null
  refreshToken: string
}

export interface ServerHealth {
  status: 'unknown' | 'up' | 'down'
  latencyMs: number | null
  checkedAt: number | null
}

interface ServersState {
  urls: Record<ServerKind, string>
  mode: ServerMode
  active: ServerKind
  sessions: Record<ServerKind, ServerSession | null>
  health: Record<ServerKind, ServerHealth>
  setUrl(kind: ServerKind, url: string): void
  setMode(mode: ServerMode): void
}

const UNKNOWN_HEALTH: ServerHealth = { status: 'unknown', latencyMs: null, checkedAt: null }

/** "loja.x.com.br/api" → "https://loja.x.com.br/api". Vazio continua vazio (servidor desligado). */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** Endereço do build quando é absoluto (nuvem); no build da loja (`/api`) a nuvem começa vazia. */
function defaultCloudUrl(): string {
  return API_URL.startsWith('/') ? '' : API_URL
}

export const useWaiterServersStore = create<ServersState>()(
  persist(
    (set) => ({
      urls: { loja: '', nuvem: defaultCloudUrl() },
      mode: 'auto',
      active: 'nuvem',
      sessions: { loja: null, nuvem: null },
      health: { loja: UNKNOWN_HEALTH, nuvem: UNKNOWN_HEALTH },
      setUrl: (kind, url) =>
        set((state) => {
          const normalized = normalizeServerUrl(url)
          if (normalized === state.urls[kind]) return state
          // Outro endereço é outro servidor: a sessão antiga não vale lá.
          return {
            urls: { ...state.urls, [kind]: normalized },
            sessions: { ...state.sessions, [kind]: null },
            health: { ...state.health, [kind]: UNKNOWN_HEALTH },
          }
        }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'waiter-servers',
      partialize: (state) => ({
        urls: state.urls,
        mode: state.mode,
        active: state.active,
        // Access token dura 15 min: no próximo uso o refresh renova.
        sessions: {
          loja: state.sessions.loja ? { accessToken: null, refreshToken: state.sessions.loja.refreshToken } : null,
          nuvem: state.sessions.nuvem ? { accessToken: null, refreshToken: state.sessions.nuvem.refreshToken } : null,
        },
      }),
    }
  )
)

/** Servidores com endereço, na ordem de preferência (loja primeiro). */
export function configuredServers(urls: Record<ServerKind, string>): ServerKind[] {
  return SERVER_KINDS.filter((kind) => Boolean(urls[kind]))
}

/**
 * Qual servidor usar. Fixo: o escolhido. Automático: o primeiro que respondeu e tem sessão, loja
 * antes da nuvem. Nenhum serve: fica onde está (a fila do celular segura os lançamentos).
 */
export function chooseServer(input: {
  mode: ServerMode
  active: ServerKind
  urls: Record<ServerKind, string>
  health: Record<ServerKind, ServerHealth>
  sessions: Record<ServerKind, ServerSession | null>
}): ServerKind {
  if (input.mode !== 'auto') return input.mode
  const usable = configuredServers(input.urls).filter(
    (kind) => input.health[kind].status === 'up' && input.sessions[kind] !== null
  )
  return usable[0] ?? input.active
}

/** Endereço a usar antes do login: o primeiro que responder, loja antes da nuvem. */
async function firstReachable(urls: Record<ServerKind, string>, mode: ServerMode): Promise<ServerKind | null> {
  const candidates = mode === 'auto' ? configuredServers(urls) : configuredServers(urls).filter((kind) => kind === mode)
  const results = await Promise.all(candidates.map((kind) => probe(urls[kind])))
  const index = results.findIndex((result) => result.status === 'up')
  return index >= 0 ? (candidates[index] ?? null) : null
}

async function probe(url: string): Promise<ServerHealth> {
  const started = performance.now()
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS), cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    return { status: 'up', latencyMs: Math.round(performance.now() - started), checkedAt: Date.now() }
  } catch {
    return { status: 'down', latencyMs: null, checkedAt: Date.now() }
  }
}

// ── Sessão por servidor ──────────────────────────────────────────────────────────────────────────

/** Senha da última entrada, só na memória: serve para entrar no outro servidor quando ele voltar. */
let pendingCredentials: { email: string; password: string } | null = null

/** Liga o cliente HTTP e o WebSocket no servidor ativo (chamado ao abrir o app e a cada troca). */
export function applyActiveServer(): void {
  const { urls, active } = useWaiterServersStore.getState()
  setApiServerOverride(urls[active] || null)
}

// Ao abrir o app já no /garcom, o cliente HTTP aponta para o servidor em uso antes do primeiro
// pedido (o AuthGuard renova a sessão antes de o WaiterApp montar).
if (typeof window !== 'undefined' && isWaiterPath(window.location.pathname)) applyActiveServer()

/** Guarda os tokens do `authStore` na sessão do servidor ativo (refresh rotativo muda o token). */
function rememberActiveSession(): void {
  const { accessToken, refreshToken } = useAuthStore.getState()
  const { active, sessions } = useWaiterServersStore.getState()
  if (!refreshToken) return
  const current = sessions[active]
  if (current?.refreshToken === refreshToken && current.accessToken === accessToken) return
  useWaiterServersStore.setState({ sessions: { ...sessions, [active]: { accessToken, refreshToken } } })
}

/** Troca o servidor em uso: guarda a sessão do atual e carrega a do outro no `authStore`. */
export function switchServer(kind: ServerKind): boolean {
  const state = useWaiterServersStore.getState()
  if (state.active === kind) return false
  const target = state.sessions[kind]
  if (!target) return false
  rememberActiveSession()
  useWaiterServersStore.setState({ active: kind })
  applyActiveServer()
  useAuthStore.setState({ accessToken: target.accessToken, refreshToken: target.refreshToken })
  return true
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
}

async function loginAt(url: string, credentials: { email: string; password: string }): Promise<LoginResponse | 'refused' | 'unreachable'> {
  try {
    const response = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return response.status >= 500 ? 'unreachable' : 'refused'
    return (await response.json()) as LoginResponse
  } catch {
    return 'unreachable'
  }
}

/**
 * Antes do login do app do garçom: aponta o cliente HTTP para o primeiro servidor que responder,
 * para entrar mesmo com a internet fora (pela loja) ou com a loja desligada (pela nuvem).
 */
export async function prepareWaiterLogin(): Promise<void> {
  const { urls, mode } = useWaiterServersStore.getState()
  const reachable = await firstReachable(urls, mode)
  if (reachable) useWaiterServersStore.setState({ active: reachable })
  applyActiveServer()
}

/**
 * Depois do login: guarda a sessão de quem respondeu e entra nos outros servidores com a mesma
 * conta. Quem estiver fora do ar entra sozinho quando voltar (enquanto o app estiver aberto).
 */
export async function connectOtherServers(email: string, password: string): Promise<void> {
  rememberActiveSession()
  pendingCredentials = { email, password }
  await loginMissingServers()
}

async function loginMissingServers(onlyUp = false): Promise<void> {
  if (!pendingCredentials) return
  const credentials = pendingCredentials
  const { urls, sessions, health } = useWaiterServersStore.getState()
  const missing = configuredServers(urls).filter(
    (kind) => sessions[kind] === null && (!onlyUp || health[kind].status === 'up')
  )
  await Promise.all(
    missing.map(async (kind) => {
      const result = await loginAt(urls[kind], credentials)
      if (result === 'unreachable' || result === 'refused') return
      const latest = useWaiterServersStore.getState()
      useWaiterServersStore.setState({
        sessions: { ...latest.sessions, [kind]: { accessToken: result.accessToken, refreshToken: result.refreshToken } },
      })
    })
  )
  const after = useWaiterServersStore.getState()
  if (configuredServers(after.urls).every((kind) => after.sessions[kind] !== null)) pendingCredentials = null
}

/** Entrar num servidor pela tela de configuração (sessão perdida, endereço novo). */
export async function loginServer(kind: ServerKind, email: string, password: string): Promise<'ok' | 'refused' | 'unreachable'> {
  const { urls } = useWaiterServersStore.getState()
  if (!urls[kind]) return 'unreachable'
  const result = await loginAt(urls[kind], { email, password })
  if (result === 'refused' || result === 'unreachable') return result
  const latest = useWaiterServersStore.getState()
  useWaiterServersStore.setState({
    sessions: { ...latest.sessions, [kind]: { accessToken: result.accessToken, refreshToken: result.refreshToken } },
  })
  if (latest.active === kind) useAuthStore.setState({ accessToken: result.accessToken, refreshToken: result.refreshToken })
  return 'ok'
}

/** Ao sair: encerra a sessão em cada servidor e esquece os tokens (os endereços ficam). */
export async function signOutAllServers(): Promise<void> {
  rememberActiveSession()
  const { urls, sessions, active } = useWaiterServersStore.getState()
  pendingCredentials = null
  await Promise.all(
    configuredServers(urls)
      .filter((kind) => kind !== active && sessions[kind])
      .map((kind) =>
        fetch(`${urls[kind]}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: sessions[kind]?.refreshToken }),
          signal: AbortSignal.timeout(3_000),
        }).catch(() => undefined)
      )
  )
  useWaiterServersStore.setState({ sessions: { loja: null, nuvem: null } })
}

// ── Monitor ──────────────────────────────────────────────────────────────────────────────────────

export async function checkServers(): Promise<void> {
  const { urls } = useWaiterServersStore.getState()
  const results = await Promise.all(
    SERVER_KINDS.map(async (kind) => [kind, urls[kind] ? await probe(urls[kind]) : UNKNOWN_HEALTH] as const)
  )
  useWaiterServersStore.setState({ health: Object.fromEntries(results) as Record<ServerKind, ServerHealth> })
}

/**
 * Mede os servidores, entra no que voltou e troca para o melhor. Ao trocar, as telas buscam de novo
 * no servidor novo e a fila do celular tenta enviar.
 */
export function useServerSelection(onSwitched?: () => void, enabled = true): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    applyActiveServer()
    // Quem já estava logado antes dos dois servidores: a sessão atual é a do servidor ativo.
    rememberActiveSession()
    // Refresh rotativo: cada token novo do authStore vai para a sessão do servidor ativo.
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (state.refreshToken !== previous.refreshToken || state.accessToken !== previous.accessToken) {
        rememberActiveSession()
      }
    })

    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const tick = async () => {
      await checkServers()
      await loginMissingServers(true)
      const state = useWaiterServersStore.getState()
      const next = chooseServer(state)
      if (next !== state.active && switchServer(next)) {
        toast.info(`Conectado: ${SERVER_LABELS[next].toLowerCase()}`)
        void queryClient.invalidateQueries()
        onSwitched?.()
      }
      if (stopped) return
      const activeDown = useWaiterServersStore.getState().health[useWaiterServersStore.getState().active].status === 'down'
      timer = setTimeout(() => void tick(), activeDown ? HEALTH_INTERVAL_DOWN_MS : HEALTH_INTERVAL_MS)
    }
    void tick()
    const onOnline = () => {
      if (timer) clearTimeout(timer)
      void tick()
    }
    window.addEventListener('online', onOnline)
    return () => {
      stopped = true
      unsubscribe()
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', onOnline)
    }
  }, [queryClient, onSwitched, enabled])
}
