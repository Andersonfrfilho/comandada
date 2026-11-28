import { getApiUrl } from './apiEndpoints'

interface ApiOptions extends RequestInit {
  token?: string
  /** Arquivo de exportação: devolve o `Blob` em vez de ler JSON. */
  asBlob?: boolean
}

interface AuthBridge {
  getAccessToken(): string | null
  refresh(): Promise<boolean>
  /** Ainda tem refresh token: a renovação falhou por rede, não por recusa. */
  hasSession(): boolean
  onSessionExpired(): void
}

let authBridge: AuthBridge | null = null

/**
 * O store de auth importa este módulo, então a ligação inversa é injetada em
 * runtime para não criar ciclo de import.
 */
export function configureAuthBridge(bridge: AuthBridge): void {
  authBridge = bridge
}

// Um 401 derruba todas as queries da tela de uma vez; sem compartilhar a
// promise, cada uma dispararia seu próprio refresh e invalidaria o token das
// outras (o refresh token é rotativo).
let pendingRefresh: Promise<boolean> | null = null

function refreshOnce(): Promise<boolean> {
  if (!authBridge) return Promise.resolve(false)
  pendingRefresh ??= authBridge.refresh().finally(() => {
    pendingRefresh = null
  })
  return pendingRefresh
}

function buildHeaders(fetchOptions: RequestInit, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, asBlob, ...fetchOptions } = options

  let response = await fetch(`${getApiUrl()}${path}`, {
    ...fetchOptions,
    headers: buildHeaders(fetchOptions, token),
  }).catch(() => {
    throw new ApiError('Sem conexão com o servidor. Confira a internet e tente de novo.', 0, 'network_error')
  })

  // As próprias rotas de sessão não podem entrar no ciclo de renovação. Trocar senha entra: depois de
  // recarregar a página o access token ainda não existe, e sem renovar a troca respondia 401.
  const isAuthRoute = ['/auth/login', '/auth/refresh', '/auth/logout'].includes(path)

  if (response.status === 401 && !isAuthRoute && authBridge) {
    const renewed = await refreshOnce()
    if (renewed) {
      response = await fetch(`${getApiUrl()}${path}`, {
        ...fetchOptions,
        headers: buildHeaders(fetchOptions, authBridge.getAccessToken() ?? undefined),
      })
    }
    if (response.status === 401) {
      // Renovação que não chegou ao servidor: a sessão continua, o erro é de conexão.
      if (!renewed && authBridge.hasSession()) {
        throw new ApiError('Sem conexão com o servidor. Confira a internet e tente de novo.', 0, 'network_error')
      }
      authBridge.onSessionExpired()
      throw new ApiError('Sua sessão expirou. Entre novamente.', 401, 'session_expired')
    }
  }

  if (asBlob && response.ok) return (await response.blob()) as T

  const data: unknown = await response.json().catch(() => null)
  const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}

  if (!response.ok) {
    // Módulos do SDK respondem `{ error: { code, message } }`; as rotas do painel, `{ error, message }`.
    const envelope = readErrorEnvelope(body['error'])
    const serverMessage = envelope?.message ?? body['message']
    // Erro do servidor vem em inglês ("An internal error occurred"); a equipe precisa de uma frase que diga o que fazer.
    const message =
      response.status >= 500 || typeof serverMessage !== 'string'
        ? 'Não deu certo agora. Tente de novo em instantes.'
        : serverMessage
    const code = envelope?.code ?? (typeof body['error'] === 'string' ? body['error'] : undefined)
    throw new ApiError(message, response.status, code, data)
  }

  return data as T
}

type ErrorEnvelope = { readonly code?: string; readonly message?: string }

function readErrorEnvelope(value: unknown): ErrorEnvelope | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { code, message } = value as Record<string, unknown>
  return {
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof message === 'string' ? { message } : {}),
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    /** Corpo da resposta: o `readErrorCode` do SDK lê `body.error.code` daqui. */
    public readonly body?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), token }),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body), token }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), token }),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: 'DELETE', token }),
  getBlob: (path: string, token?: string) => request<Blob>(path, { method: 'GET', token, asBlob: true }),
  postBlob: (path: string, body: unknown, token?: string) =>
    request<Blob>(path, { method: 'POST', body: JSON.stringify(body), token, asBlob: true }),
}
