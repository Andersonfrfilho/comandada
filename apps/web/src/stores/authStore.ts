import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, configureAuthBridge } from '@/lib/api'
import { hasPermission, permissionsFromAccessToken, type Permission, type PermissionRule } from '@/lib/permissions'

interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  establishmentId: string
  passwordMustChange: boolean
  permissions: Permission[]
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login(email: string, password: string, remember?: boolean): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<boolean>
  clearPasswordMustChange(): void
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

let inFlightRefresh: Promise<boolean> | undefined

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      async login(email, password, remember = false) {
        const data = await api.post<LoginResponse>('/auth/login', { email, password })
        set({
          user: { ...data.user, permissions: data.user.permissions ?? permissionsFromAccessToken(data.accessToken) ?? [] },
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        })
        if (remember) {
          localStorage.setItem('order-hub-email', email)
        } else {
          localStorage.removeItem('order-hub-email')
        }
      },

      async logout() {
        const { refreshToken, accessToken } = get()
        if (refreshToken) {
          try {
            await api.post('/auth/logout', { refreshToken }, accessToken ?? undefined)
          } catch {
            // Best effort
          }
        }
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      clearPasswordMustChange() {
        set((state) => ({
          user: state.user ? { ...state.user, passwordMustChange: false } : null,
        }))
      },

      async refresh() {
        // The API revokes the whole session when a rotated token is reused, so concurrent callers share one call.
        inFlightRefresh ??= refreshSession().finally(() => {
          inFlightRefresh = undefined
        })
        return inFlightRefresh

        async function refreshSession(): Promise<boolean> {
          const { refreshToken } = get()
          if (!refreshToken) return false
          try {
            const data = await api.post<RefreshResponse>('/auth/refresh', { refreshToken })
            const permissions = permissionsFromAccessToken(data.accessToken)
            set((state) => ({
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
              user: state.user && permissions ? { ...state.user, permissions } : state.user,
            }))
            return true
          } catch {
            set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
            return false
          }
        }
      },
    }),
    {
      name: 'order-hub-auth',
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

/** Se quem entrou pode fazer a ação; o menu, as rotas e os botões usam a mesma regra da API. */
export function useCan(required: PermissionRule): boolean {
  return useAuthStore((state) => hasPermission(state.user?.permissions, required))
}

// Permite ao cliente HTTP renovar o token em qualquer 401 e, se a renovação
// falhar, encerrar a sessão — sem isso a tela ficava vazia em silêncio, como se
// os dados tivessem sumido.
configureAuthBridge({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: () => useAuthStore.getState().refresh(),
  onSessionExpired: () => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    })
  },
})
