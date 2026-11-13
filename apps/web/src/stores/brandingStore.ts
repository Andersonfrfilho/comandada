import { create } from 'zustand'
import { api } from '@/lib/api'
import { applyBranding, toBranding, type Branding, type BrandingResponse } from '@/lib/branding'

interface BrandingState {
  branding: Branding
  // Antes do login: marca do domínio pelo qual o painel foi aberto (ou a padrão).
  loadForHost(): Promise<void>
  // Depois do login: marca do restaurante de quem entrou.
  loadForEstablishment(token: string): Promise<void>
  apply(response: BrandingResponse | null): void
}

const BRANDING_CACHE_KEY = 'comandada-branding'

function cachedBranding(): Branding {
  try {
    const cached = localStorage.getItem(BRANDING_CACHE_KEY)
    return toBranding(cached ? (JSON.parse(cached) as BrandingResponse) : null)
  } catch {
    return toBranding(null)
  }
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  branding: cachedBranding(),

  apply(response) {
    const branding = toBranding(response)
    try {
      localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding))
    } catch {
      // Sem armazenamento local a marca só não fica guardada entre visitas.
    }
    applyBranding(branding)
    set({ branding })
  },

  async loadForHost() {
    try {
      const host = encodeURIComponent(window.location.hostname)
      get().apply(await api.get<BrandingResponse | null>(`/public/branding?host=${host}`))
    } catch {
      applyBranding(get().branding)
    }
  },

  async loadForEstablishment(token) {
    try {
      get().apply(await api.get<BrandingResponse | null>('/branding', token))
    } catch {
      applyBranding(get().branding)
    }
  },
}))

// Pinta a última marca conhecida já na primeira renderização, antes da resposta da API.
applyBranding(useBrandingStore.getState().branding)
