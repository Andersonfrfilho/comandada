import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { hasPermission } from '@/lib/permissions'
import { homePathFor, permissionForPath } from '@/constants/navigation'
import { useAuthStore } from '@/stores/authStore'
import { isWaiterPath } from '@/pages/waiter/waiterModel'

/**
 * Rota protegida pela permissão do item de menu correspondente (a mesma que a API confere).
 * Sem a permissão, volta para a tela inicial do cargo, nunca para um Dashboard que daria 403.
 */
export function PermissionGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace />

  const required = permissionForPath(location.pathname)
  if (required && !hasPermission(user.permissions, required)) {
    return <Navigate to={homePathFor(user.permissions) ?? '/'} replace />
  }

  return <>{children}</>
}

/** "/" abre o Dashboard só para quem vê relatórios; os outros vão para a primeira tela do cargo. */
export function HomeRoute({ dashboard }: { dashboard: React.ReactNode }) {
  const permissions = useAuthStore((state) => state.user?.permissions)
  const home = homePathFor(permissions)

  if (home === '/') return <>{dashboard}</>
  if (home) return <Navigate to={home} replace />

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-lg font-semibold text-gray-900">Nenhuma tela liberada</h1>
      <p className="mt-2 text-sm text-gray-600">
        Seu cargo ainda não tem acesso a nenhuma tela do painel. Peça a um administrador para ajustar o cargo em
        Administração → Cargos.
      </p>
    </div>
  )
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const refresh = useAuthStore((state) => state.refresh)
  const location = useLocation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // accessToken is not persisted — after page reload it's null even if isAuthenticated is true.
    // Silently refresh before rendering protected content.
    if (isAuthenticated && !accessToken) {
      void refresh().finally(() => setReady(true))
    } else {
      setReady(true)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) {
    // O app do garçom volta para ele depois do login (instalado, abre em /garcom).
    const next = isWaiterPath(location.pathname) ? `?next=${encodeURIComponent(location.pathname)}` : ''
    return <Navigate to={`/login${next}`} replace />
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user?.passwordMustChange) {
    return <Navigate to="/change-password" replace />
  }

  return <>{children}</>
}
