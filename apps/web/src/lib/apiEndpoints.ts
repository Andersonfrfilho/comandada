/// <reference types="vite/client" />

/**
 * Endereços da API resolvidos uma vez para o painel inteiro.
 *
 * Na nuvem o build recebe URLs absolutas (`VITE_API_URL=https://api...`). No servidor da loja o
 * build usa caminhos relativos (`VITE_API_URL=/api`, `VITE_API_WS_URL=/ws`): o nginx que serve o
 * painel faz o proxy para a API, então o mesmo build funciona em qualquer IP ou nome da rede local
 * (`http://comandada.local`, `http://192.168.0.10`) sem recompilar.
 */
const DEFAULT_API_URL = 'http://localhost:3333'
const DEFAULT_WS_URL = 'ws://localhost:3333/ws'

function isRelativePath(value: string): boolean {
  return value.startsWith('/')
}

function resolveWebSocketUrl(configuredUrl: string): string {
  if (!isRelativePath(configuredUrl)) return configuredUrl
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${configuredUrl}`
}

function removeTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export const API_URL: string = removeTrailingSlash(
  (import.meta.env.VITE_API_URL as string | undefined) ?? DEFAULT_API_URL
)

export const WS_URL: string = resolveWebSocketUrl(
  (import.meta.env.VITE_API_WS_URL as string | undefined) ?? DEFAULT_WS_URL
)

/**
 * Servidor escolhido em tempo de execução (app do garçom: loja ou nuvem). Sem escolha, vale o do
 * build. Só o cliente HTTP (`lib/api.ts`) e o WebSocket seguem a troca.
 */
let serverOverride: { apiUrl: string; wsUrl: string } | null = null

/** `https://loja.x/api` → `wss://loja.x/ws`; `https://api.x` → `wss://api.x/ws`. */
export function webSocketUrlFor(apiUrl: string): string {
  const url = removeTrailingSlash(apiUrl).replace(/^http/, 'ws')
  return url.endsWith('/api') ? `${url.slice(0, -'/api'.length)}/ws` : `${url}/ws`
}

export function setApiServerOverride(apiUrl: string | null): void {
  serverOverride = apiUrl ? { apiUrl: removeTrailingSlash(apiUrl), wsUrl: webSocketUrlFor(apiUrl) } : null
}

export function getApiUrl(): string {
  return serverOverride?.apiUrl ?? API_URL
}

export function getWsUrl(): string {
  return serverOverride?.wsUrl ?? WS_URL
}
