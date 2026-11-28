/**
 * Chamadas às rotas dos módulos do SDK (`/sdk/...`) pelo cliente do painel. Os módulos devolvem
 * `{ data }`; as listas vêm como `{ data: { data, pagination } }`, então o `unwrap` tira só o envelope.
 */

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

export const SDK_PATH = {
  RECIPES: '/sdk/recipes',
  STOCK: '/sdk/stock',
} as const

// Resposta 204 chega como `null`: não há envelope para abrir.
type SdkEnvelope<TData> = { readonly data: TData } | null

function unwrap<TData>(envelope: SdkEnvelope<TData>): TData {
  return envelope?.data as TData
}

type QueryValue = string | number | boolean | undefined

export function accessToken(): string | undefined {
  return useAuthStore.getState().accessToken ?? undefined
}

export function buildQuery(params: Readonly<Record<string, QueryValue>>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export async function sdkGet<TData>(path: string): Promise<TData> {
  return unwrap(await api.get<SdkEnvelope<TData>>(path, accessToken()))
}

export async function sdkPost<TData>(path: string, body: unknown): Promise<TData> {
  return unwrap(await api.post<SdkEnvelope<TData>>(path, body, accessToken()))
}

export async function sdkPut<TData>(path: string, body: unknown): Promise<TData> {
  return unwrap(await api.put<SdkEnvelope<TData>>(path, body, accessToken()))
}

export async function sdkPatch<TData>(path: string, body: unknown): Promise<TData> {
  return unwrap(await api.patch<SdkEnvelope<TData>>(path, body, accessToken()))
}

export async function sdkDelete(path: string): Promise<void> {
  await api.delete(path, accessToken())
}
