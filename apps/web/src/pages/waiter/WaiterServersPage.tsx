import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, CloudOff, RefreshCw, Server, Store, Cloud, Trash2, RotateCcw, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { confirmDialog } from '@/stores/confirmStore'
import { toast } from '@/stores/toastStore'
import { flushOutbox, useIsOnline, useOutboxSync, useWaiterOutboxStore, type OutboxEntry, type SentEvent } from './waiterOffline'
import {
  SERVER_LABELS,
  applyActiveServer,
  checkServers,
  loginServer,
  switchServer,
  useServerSelection,
  useWaiterServersStore,
  type ServerKind,
  type ServerMode,
} from './waiterServers'
import { waiterPaths } from './waiterModel'

const MODE_LABELS: Record<ServerMode, string> = {
  auto: 'Automático',
  loja: 'Só loja',
  nuvem: 'Só nuvem',
}

const MODE_HINTS: Record<ServerMode, string> = {
  auto: 'Usa a loja quando ela responde; senão, a nuvem. Sem nenhum, guarda no celular.',
  loja: 'Sempre pela loja. Se ela cair, os lançamentos esperam no celular.',
  nuvem: 'Sempre pela nuvem. Se a internet cair, os lançamentos esperam no celular.',
}

const KIND_LABELS: Record<OutboxEntry['kind'], string> = { order: 'Pedido', 'request-bill': 'Pedir a conta' }

const PLACEHOLDERS: Record<ServerKind, string> = {
  loja: 'https://loja.seudominio.com.br/api',
  nuvem: 'https://api.seudominio.com.br',
}

function formatTime(iso: string | number): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function ServerIcon({ kind }: { kind: ServerKind }) {
  return kind === 'loja' ? <Store className="h-5 w-5" /> : <Cloud className="h-5 w-5" />
}

function ServerCard({ kind }: { kind: ServerKind }) {
  const url = useWaiterServersStore((state) => state.urls[kind])
  const health = useWaiterServersStore((state) => state.health[kind])
  const hasSession = useWaiterServersStore((state) => state.sessions[kind] !== null)
  const active = useWaiterServersStore((state) => state.active === kind)
  const setUrl = useWaiterServersStore((state) => state.setUrl)
  const user = useAuthStore((state) => state.user)
  const [draft, setDraft] = useState(url)
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => setDraft(url), [url])

  function saveUrl() {
    if (draft.trim() === url) return
    setUrl(kind, draft)
    if (active) applyActiveServer()
    void checkServers()
  }

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!user) return
    setSigningIn(true)
    const result = await loginServer(kind, user.email, password)
    setSigningIn(false)
    setPassword('')
    if (result === 'ok') toast.success(`Conectado: ${SERVER_LABELS[kind].toLowerCase()}`)
    else toast.error(result === 'refused' ? 'Senha não confere neste servidor' : 'Servidor não respondeu')
  }

  const statusText = !url
    ? 'Sem endereço'
    : health.status === 'up'
      ? `No ar · ${health.latencyMs} ms`
      : health.status === 'down'
        ? 'Não responde'
        : 'Verificando...'
  const statusTone = !url ? 'bg-gray-300' : health.status === 'up' ? 'bg-emerald-500' : health.status === 'down' ? 'bg-red-500' : 'bg-amber-400'

  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ring-2 ${active ? 'ring-brand-400' : 'ring-gray-200'}`}>
      <div className="flex items-center gap-2">
        <span className="text-gray-700">
          <ServerIcon kind={kind} />
        </span>
        <h2 className="flex-1 text-base font-bold text-gray-900">{SERVER_LABELS[kind]}</h2>
        {active && <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">Em uso</span>}
      </div>

      <label htmlFor={`server-${kind}`} className="mt-3 block text-xs font-medium text-gray-600">
        Endereço da API
      </label>
      <input
        id={`server-${kind}`}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={saveUrl}
        onKeyDown={(event) => event.key === 'Enter' && saveUrl()}
        placeholder={PLACEHOLDERS[kind]}
        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 text-gray-700">
          <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
          {statusText}
        </span>
        {url && (
          <span className={`flex items-center gap-1 ${hasSession ? 'text-emerald-700' : 'text-amber-700'}`}>
            {hasSession ? <CheckCircle2 className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
            {hasSession ? 'Conectado com a sua conta' : 'Precisa entrar'}
          </span>
        )}
      </div>

      {url && !hasSession && user && (
        <form onSubmit={(event) => void signIn(event)} className="mt-3 flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            placeholder={`Senha de ${user.email}`}
            aria-label={`Senha para entrar em ${SERVER_LABELS[kind]}`}
            className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <Button type="submit" loading={signingIn} loadingLabel="Entrando...">
            Entrar
          </Button>
        </form>
      )}
      {url && hasSession && !active && health.status === 'up' && (
        <button
          onClick={() => switchServer(kind) && toast.info(`Conectado: ${SERVER_LABELS[kind].toLowerCase()}`)}
          className="mt-3 text-sm font-semibold text-brand-700 hover:underline"
        >
          Usar agora
        </button>
      )}
    </section>
  )
}

function ModePicker() {
  const mode = useWaiterServersStore((state) => state.mode)
  const setMode = useWaiterServersStore((state) => state.setMode)
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-base font-bold text-gray-900">Qual usar</h2>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup">
        {(Object.keys(MODE_LABELS) as ServerMode[]).map((key) => (
          <button
            key={key}
            role="radio"
            aria-checked={mode === key}
            onClick={() => setMode(key)}
            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${
              mode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-gray-600">{MODE_HINTS[mode]}</p>
    </section>
  )
}

function serverLabelFor(url: string, urls: Record<ServerKind, string>): string {
  if (url === urls.loja) return 'loja'
  if (url === urls.nuvem) return 'nuvem'
  return 'servidor'
}

function PendingRow({ entry }: { entry: OutboxEntry }) {
  const retry = useWaiterOutboxStore((state) => state.retry)
  const discard = useWaiterOutboxStore((state) => state.discard)
  const queryClient = useQueryClient()

  async function confirmDiscard() {
    const confirmed = await confirmDialog({
      title: 'Descartar este lançamento?',
      message: `${KIND_LABELS[entry.kind]}: ${entry.label}. Ele não vai para a cozinha.`,
      confirmLabel: 'Descartar',
      tone: 'danger',
    })
    if (confirmed) discard(entry.id)
  }

  return (
    <li className={`rounded-xl p-3 ring-1 ${entry.rejected ? 'bg-red-50 ring-red-200' : 'bg-sky-50 ring-sky-200'}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {KIND_LABELS[entry.kind]} · {entry.label}
          </p>
          <p className={`text-xs ${entry.rejected ? 'text-red-700' : 'text-sky-800'}`}>
            {entry.rejected
              ? `Recusado: ${entry.rejected}`
              : `Aguardando desde ${formatTime(entry.createdAt)}${entry.attempts > 0 ? ` · ${entry.attempts} tentativa(s)` : ''}`}
          </p>
        </div>
        {entry.rejected && (
          <button
            onClick={() => {
              retry(entry.id)
              void flushOutbox(queryClient)
            }}
            aria-label="Tentar de novo"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 hover:bg-white active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => void confirmDiscard()}
          aria-label="Descartar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-white active:scale-95"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}

function SentRow({ event, urls }: { event: SentEvent; urls: Record<ServerKind, string> }) {
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      <span className="min-w-0 flex-1 truncate text-gray-800">
        {KIND_LABELS[event.kind]} · {event.label}
      </span>
      <span className="shrink-0 text-xs text-gray-500">
        {serverLabelFor(event.server, urls)}
        {event.queued ? ' · pela fila' : ''} · {formatTime(event.sentAt)}
      </span>
    </li>
  )
}

function EventQueue() {
  const entries = useWaiterOutboxStore((state) => state.entries)
  const sent = useWaiterOutboxStore((state) => state.sent)
  const urls = useWaiterServersStore((state) => state.urls)
  const online = useIsOnline()
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)
  const waiting = entries.filter((entry) => !entry.rejected).length

  async function sendNow() {
    setSending(true)
    await flushOutbox(queryClient)
    setSending(false)
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold text-gray-900">Fila de eventos</h2>
        {waiting > 0 && (
          <Button size="sm" onClick={() => void sendNow()} loading={sending} loadingLabel="Enviando..." disabled={!online}>
            <Send className="h-4 w-4" />
            Enviar agora
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">Nada esperando. Tudo o que foi lançado chegou no servidor.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <PendingRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      {sent.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Enviados</h3>
          <ul className="divide-y divide-gray-100">
            {sent.slice(0, 15).map((event) => (
              <SentRow key={event.id} event={event} urls={urls} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * Servidores e fila: endereço da loja e da nuvem, se cada um está no ar e conectado, qual usar, e
 * o que está esperando para sair do celular. Abre sem login (configurar a loja antes de entrar).
 */
export function WaiterServersPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [checking, setChecking] = useState(false)
  const queryClient = useQueryClient()
  // Logado, a tela também troca de servidor e esvazia a fila (o garçom vê acontecer aqui).
  const flushAfterSwitch = useCallback(() => void flushOutbox(queryClient), [queryClient])
  useServerSelection(flushAfterSwitch, isAuthenticated)
  useOutboxSync()

  useEffect(() => {
    void checkServers()
  }, [])

  async function checkNow() {
    setChecking(true)
    await checkServers()
    setChecking(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-2">
          <Link
            to={isAuthenticated ? waiterPaths.tables : `/login?next=${waiterPaths.tables}`}
            aria-label="Voltar"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Server className="h-5 w-5 text-gray-500" />
          <h1 className="flex-1 text-base font-bold">Servidores e fila</h1>
          <button
            onClick={() => void checkNow()}
            disabled={checking}
            aria-label="Verificar agora"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${checking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-3 px-3 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
        <ServerCard kind="loja" />
        <ServerCard kind="nuvem" />
        <ModePicker />
        <EventQueue />
        <p className="px-1 text-xs text-gray-500">
          O servidor da loja precisa de HTTPS e liberar este app em <code>ALLOWED_ORIGINS</code>. Loja e nuvem se
          sincronizam sozinhas: o que entra por uma aparece na outra em segundos.
        </p>
      </main>
    </div>
  )
}
