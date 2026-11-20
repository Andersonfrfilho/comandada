import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, LogOut, UtensilsCrossed, X } from 'lucide-react'
import { useAuthStore, useCan } from '@/stores/authStore'
import { useBrandingStore } from '@/stores/brandingStore'
import { WaiterTablesPage } from './WaiterTablesPage'
import { WaiterTablePage } from './WaiterTablePage'
import { WaiterComandaPage } from './WaiterComandaPage'
import { WaiterLaunchPage } from './WaiterLaunchPage'
import { requestNotificationPermission, useWaiterAlerts, useWaiterAlertsStore } from './waiterAlerts'
import { PANEL_MANIFEST_PATH, WAITER_MANIFEST_PATH, readyNoticeLabel, waiterPaths } from './waiterModel'

/** Instalar pelo /garcom tem que levar o manifest do garçom, mesmo quando o app abriu pelo painel. */
function useWaiterManifest(): void {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return
    link.href = WAITER_MANIFEST_PATH
    return () => {
      link.href = PANEL_MANIFEST_PATH
    }
  }, [])
}

function notificationState(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

function ReadyTray() {
  const notices = useWaiterAlertsStore((state) => state.notices)
  const dismiss = useWaiterAlertsStore((state) => state.dismiss)
  const navigate = useNavigate()
  if (notices.length === 0) return null
  return (
    <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2" aria-live="polite">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Prontos para levar</p>
      <ul className="space-y-1.5">
        {notices.slice(0, 4).map((notice) => (
          <li key={notice.orderId} className="flex items-center gap-2">
            <button
              onClick={() => notice.comandaId && navigate(waiterPaths.comanda(notice.comandaId))}
              className="flex min-h-[44px] flex-1 items-center gap-2 rounded-xl bg-white px-3 text-left text-sm font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-200 active:scale-[0.98]"
            >
              <BellRing className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="truncate">{readyNoticeLabel(notice)}</span>
            </button>
            <button
              onClick={() => dismiss(notice.orderId)}
              aria-label={`Marcar ${readyNoticeLabel(notice)} como levado`}
              className="flex h-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white active:scale-95"
            >
              <Check className="h-4 w-4" />
              Levei
            </button>
          </li>
        ))}
      </ul>
      {notices.length > 4 && <p className="mt-1 text-xs text-emerald-700">+{notices.length - 4} pedidos prontos</p>}
    </div>
  )
}

function WaiterHeader() {
  const brand = useBrandingStore((state) => state.branding)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [permission, setPermission] = useState(notificationState)

  async function enableNotifications() {
    setPermission(await requestNotificationPermission())
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-14 items-center gap-3 border-b border-gray-200 px-3">
        <Link to={waiterPaths.tables} className="flex min-w-0 flex-1 items-center gap-2">
          {brand.logo ? (
            <img src={brand.logo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
          ) : (
            <UtensilsCrossed className="h-6 w-6 text-brand-600" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-gray-900">{brand.name}</p>
            <p className="truncate text-xs leading-tight text-gray-500">Garçom · {user?.name}</p>
          </div>
        </Link>
        {permission === 'default' && (
          <button
            onClick={() => void enableNotifications()}
            className="flex h-10 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 active:scale-95"
          >
            <Bell className="h-4 w-4" />
            Ativar avisos
          </button>
        )}
        <button
          onClick={() => void logout()}
          aria-label="Sair"
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 active:scale-95"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}

function NoAccess() {
  const logout = useAuthStore((state) => state.logout)
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
      <X className="h-10 w-10 text-gray-400" />
      <h1 className="text-lg font-semibold text-gray-900">Seu cargo não lança pedidos</h1>
      <p className="max-w-xs text-sm text-gray-600">
        O app do garçom precisa da permissão de lançar pedidos. Peça ao administrador para ajustar o seu cargo em Cargos.
      </p>
      <button onClick={() => void logout()} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white">
        Entrar com outra conta
      </button>
    </div>
  )
}

/**
 * App do garçom: mobile, instalável no celular (manifest próprio em /garcom). Mesas → comanda →
 * lançar itens → pedir a conta, e aviso quando a cozinha deixa um pedido da mesa pronto.
 */
export function WaiterApp() {
  const canLaunch = useCan({ resource: 'orders', action: 'write' })
  useWaiterManifest()
  useWaiterAlerts()

  if (!canLaunch) return <NoAccess />

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <WaiterHeader />
      {/* Fora do cabeçalho fixo: a barra de busca do cardápio gruda logo abaixo dele. */}
      <ReadyTray />
      <main className="mx-auto max-w-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Routes>
          <Route index element={<WaiterTablesPage />} />
          <Route path="mesa/:tableId" element={<WaiterTablePage />} />
          <Route path="comanda/:comandaId" element={<WaiterComandaPage />} />
          <Route path="comanda/:comandaId/lancar" element={<WaiterLaunchPage />} />
          <Route path="*" element={<Navigate to={waiterPaths.tables} replace />} />
        </Routes>
      </main>
    </div>
  )
}
