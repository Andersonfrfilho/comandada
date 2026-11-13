import { API_URL } from './apiEndpoints'

interface ApiOptions extends RequestInit {
  token?: string
}

interface AuthBridge {
  getAccessToken(): string | null
  refresh(): Promise<boolean>
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
  const { token, ...fetchOptions } = options

  let response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers: buildHeaders(fetchOptions, token),
  })

  // As próprias rotas de sessão não podem entrar no ciclo de renovação.
  const isAuthRoute = path.startsWith('/auth/')

  if (response.status === 401 && !isAuthRoute && authBridge) {
    const renewed = await refreshOnce()
    if (renewed) {
      response = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        headers: buildHeaders(fetchOptions, authBridge.getAccessToken() ?? undefined),
      })
    }
    if (response.status === 401) {
      authBridge.onSessionExpired()
      throw new ApiError('Sua sessão expirou. Entre novamente.', 401, 'session_expired')
    }
  }

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.message ?? 'Request failed', response.status, data.error)
  }

  return data as T
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
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
}
