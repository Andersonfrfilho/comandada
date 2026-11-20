import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, LogOut, Server, UtensilsCrossed, X } from 'lucide-react'
import { useAuthStore, useCan } from '@/stores/authStore'
import { useBrandingStore } from '@/stores/brandingStore'
import { WaiterTablesPage } from './WaiterTablesPage'
import { WaiterTablePage } from './WaiterTablePage'
import { WaiterComandaPage } from './WaiterComandaPage'
import { WaiterLaunchPage } from './WaiterLaunchPage'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff } from 'lucide-react'
import { requestNotificationPermission, useWaiterAlerts, useWaiterAlertsStore } from './waiterAlerts'
import {
  clearWaiterDeviceData,
  flushOutbox,
  useIsOnline,
  useOutboxSync,
  useWaiterOutboxStore,
  useWaiterPersistedCache,
} from './waiterOffline'
import { SERVER_LABELS, signOutAllServers, useServerSelection, useWaiterServersStore } from './waiterServers'
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

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Faixa de conexão: sem rede mostra de quando são os dados na tela; com lançamentos guardados,
 * quantos estão esperando e um botão para tentar agora.
 */
function ConnectionBar() {
  const online = useIsOnline()
  const queryClient = useQueryClient()
  const entries = useWaiterOutboxStore((state) => state.entries)
  const waiting = entries.filter((entry) => !entry.rejected).length
  const rejected = entries.length - waiting
  const tablesState = useSyncExternalStore(
    (callback) => queryClient.getQueryCache().subscribe(callback),
    () => queryClient.getQueryState(['tables'])
  )
  // Basta a primeira tentativa falhar: esperar as novas tentativas deixaria o garçom sem aviso.
  const serverDown = online && (tablesState?.status === 'error' || (tablesState?.fetchFailureCount ?? 0) > 0)
  const [retrying, setRetrying] = useState(false)

  if (online && !serverDown && entries.length === 0) return null

  async function retry() {
    setRetrying(true)
    await Promise.all([flushOutbox(queryClient), queryClient.invalidateQueries({ queryKey: ['tables'] })])
    setRetrying(false)
  }

  const offline = !online || serverDown
  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-sm ${offline ? 'bg-gray-900 text-white' : 'bg-sky-50 text-sky-900'}`} role="status">
      <CloudOff className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 leading-tight">
        {offline ? (
          <>
            <strong>{online ? 'Servidor fora do ar' : 'Sem conexão'}</strong>
            {tablesState?.dataUpdatedAt ? ` · dados de ${formatClock(tablesState.dataUpdatedAt)}` : ''}
          </>
        ) : null}
        {waiting > 0 && (
          <span className="block text-xs opacity-90">
            {waiting} {waiting === 1 ? 'lançamento aguardando' : 'lançamentos aguardando'} envio
          </span>
        )}
        {rejected > 0 && <span className="block text-xs text-red-300">{rejected} recusado(s): veja na comanda</span>}
      </p>
      {(waiting > 0 || offline) && (
        <button
          onClick={() => void retry()}
          disabled={retrying}
          className="h-9 shrink-0 rounded-lg bg-white/15 px-3 text-xs font-semibold ring-1 ring-current/30 active:scale-95 disabled:opacity-50"
        >
          {retrying ? 'Tentando...' : 'Tentar agora'}
        </button>
      )}
    </div>
  )
}

function WaiterHeader() {
  const brand = useBrandingStore((state) => state.branding)
  const user = useAuthStore((state) => state.user)
  const activeServer = useWaiterServersStore((state) => state.active)
  const hasLoja = useWaiterServersStore((state) => Boolean(state.urls.loja))
  const logout = useAuthStore((state) => state.logout)
  const clearNotices = useWaiterAlertsStore((state) => state.clear)
  const [permission, setPermission] = useState(notificationState)

  async function signOut() {
    // Celular pode ser de outro garçom no próximo turno: nada da sessão fica no aparelho.
    clearWaiterDeviceData()
    clearNotices()
    await signOutAllServers()
    await logout()
  }

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
            <p className="truncate text-xs leading-tight text-gray-500">
              Garçom · {user?.name}
              {hasLoja ? ` · ${SERVER_LABELS[activeServer].replace('Servidor da ', '')}` : ''}
            </p>
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
        <Link
          to={waiterPaths.servers}
          aria-label="Servidores e fila"
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 active:scale-95"
        >
          <Server className="h-5 w-5" />
        </Link>
        <button
          onClick={() => void signOut()}
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
  useWaiterPersistedCache()
  useWaiterAlerts()
  useOutboxSync()
  const queryClient = useQueryClient()
  // Trocou de servidor: o que estava na fila tenta sair pelo novo na hora.
  const flushAfterSwitch = useCallback(() => void flushOutbox(queryClient), [queryClient])
  useServerSelection(flushAfterSwitch)

  if (!canLaunch) return <NoAccess />

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <WaiterHeader />
      <ConnectionBar />
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
