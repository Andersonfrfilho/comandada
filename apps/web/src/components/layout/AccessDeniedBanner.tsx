import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAccessDeniedStore } from '@/stores/accessDeniedStore'

export function AccessDeniedBanner() {
  const isDenied = useAccessDeniedStore((state) => state.isDenied)
  const clear = useAccessDeniedStore((state) => state.clear)
  const location = useLocation()

  useEffect(() => {
    clear()
  }, [location.pathname, clear])

  if (!isDenied) return null

  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-2"
    >
      <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-xs text-amber-800">
        Seu perfil não tem permissão para ver parte desta tela. O que aparece abaixo pode estar
        incompleto — não significa que os dados não existem. Peça acesso a um administrador.
      </p>
    </div>
  )
}
