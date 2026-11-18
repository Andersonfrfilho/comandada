import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, LogOut, MapPin, MessageCircle, RotateCcw, Wallet } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { formatBRL } from '@/lib/listing'
import {
  SESSION_EXPIRED_ERROR_CODE,
  WINDOW_CLOSED_ERROR_CODE,
  storefrontApi,
  type StorefrontAccount,
  type StorefrontAccountOrder,
  type StorefrontMenu,
} from './storefrontApi'
import { isCompletePhone, maskPhone, whatsappLink } from './storefrontFormat'
import { storefrontStorage } from './storefrontStorage'
import { BottomSheet } from './BottomSheet'
import { DISPLAY_FONT } from './storefrontTheme'

const CODE_LENGTH = 6
const RESEND_SECONDS = 30

/** Sessão do cliente no aparelho + dados da conta. Sessão vencida some sozinha. */
export function useStorefrontAccount(establishmentId: string) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => storefrontStorage.loadSession(establishmentId))
  const queryKey = ['storefront-account', establishmentId, token]

  const query = useQuery({
    queryKey,
    queryFn: () => storefrontApi.account(establishmentId, token ?? ''),
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: (failureCount, error) => !(error instanceof ApiError && error.code === SESSION_EXPIRED_ERROR_CODE) && failureCount < 2,
  })

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.code === SESSION_EXPIRED_ERROR_CODE) {
      storefrontStorage.saveSession(establishmentId, null)
      setToken(null)
    }
  }, [query.error, establishmentId])

  const signIn = useCallback(
    (sessionToken: string, account: StorefrontAccount) => {
      storefrontStorage.saveSession(establishmentId, sessionToken)
      queryClient.setQueryData(['storefront-account', establishmentId, sessionToken], account)
      setToken(sessionToken)
    },
    [establishmentId, queryClient]
  )

  const signOut = useCallback(() => {
    storefrontStorage.saveSession(establishmentId, null)
    setToken(null)
  }, [establishmentId])

  return { account: token ? (query.data ?? null) : null, loading: Boolean(token) && query.isLoading, signIn, signOut }
}

export function firstName(account: StorefrontAccount): string | null {
  return account.name?.trim().split(/\s+/)[0] ?? null
}

function initialsOf(account: StorefrontAccount): string {
  const words = account.name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (words.length === 0) return account.phoneLabel.slice(-2)
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

export function AccountAvatar({ account, className = '' }: { account: StorefrontAccount; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white ${className}`}>{initialsOf(account)}</span>
  )
}

/** Entrar com o WhatsApp: telefone → código de 6 números que o próprio restaurante manda. */
export function LoginSheet({
  menu,
  onClose,
  onSignedIn,
}: {
  menu: StorefrontMenu
  onClose: () => void
  onSignedIn: (token: string, account: StorefrontAccount) => void
}) {
  const establishmentId = menu.establishment.id
  const profile = storefrontStorage.loadProfile(establishmentId)
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [windowClosed, setWindowClosed] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  async function sendCode() {
    if (!isCompletePhone(phone)) {
      setError('Informe seu WhatsApp com DDD.')
      return
    }
    setBusy(true)
    setError(null)
    setWindowClosed(false)
    try {
      const result = await storefrontApi.requestLoginCode(establishmentId, phone)
      setSentTo(result.sentTo)
      setCode('')
      setStep('code')
      setResendIn(RESEND_SECONDS)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === WINDOW_CLOSED_ERROR_CODE) setWindowClosed(true)
      setError(caught instanceof Error ? caught.message : 'Não conseguimos mandar o código agora.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(value: string) {
    if (value.length !== CODE_LENGTH || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await storefrontApi.verifyLoginCode(establishmentId, phone, value)
      onSignedIn(result.token, result.account)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não deu certo. Tente de novo.')
      setCode('')
      codeRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const restaurantChat = whatsappLink(menu.establishment.whatsappNumber, 'Oi')

  return (
    <BottomSheet title="Entrar com o WhatsApp" onClose={onClose}>
      <div className="space-y-5 px-5 pb-6">
        {step === 'phone' ? (
          <>
            <div className="space-y-2">
              <p className={`text-2xl font-semibold leading-tight text-[#1c120d] ${DISPLAY_FONT}`}>Peça em segundos na próxima vez</p>
              <p className="text-[15px] leading-relaxed text-[#4f3e34]">
                Mandamos um código pelo WhatsApp do {menu.establishment.name}. Sem senha. Seus endereços, a forma de pagamento e os últimos pedidos ficam
                guardados.
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void sendCode()
              }}
              className="space-y-3"
            >
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[#4f3e34]">Seu WhatsApp</span>
                <span className="flex items-center gap-2 rounded-xl bg-white px-4 ring-1 ring-[#e6d3bb] focus-within:ring-2 focus-within:ring-brand-500">
                  <span className="text-[15px] font-semibold text-[#6b574b]">+55</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(maskPhone(event.target.value))}
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(16) 99999-9999"
                    className="h-14 w-full bg-transparent text-[17px] outline-none"
                    autoFocus
                  />
                </span>
              </label>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
              {windowClosed && restaurantChat && (
                <a
                  href={restaurantChat}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> Mandar um oi no WhatsApp
                </a>
              )}
              <button
                type="submit"
                disabled={busy}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-bold text-white shadow-md shadow-brand-600/25 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
                {windowClosed ? 'Já mandei, enviar o código' : 'Receber código no WhatsApp'}
              </button>
            </form>
            <ul className="space-y-2 text-sm text-[#4f3e34]">
              {['Endereços e pagamento já preenchidos', 'Repetir o último pedido com um toque', 'Pedidos do WhatsApp e do site no mesmo lugar'].map((benefit) => (
                <li key={benefit} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-brand-700" aria-hidden="true" /> {benefit}
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClose} className="w-full py-2 text-sm font-semibold text-[#4f3e34]">
              Agora não, pedir sem cadastro
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <p className={`text-2xl font-semibold text-[#1c120d] ${DISPLAY_FONT}`}>Digite o código</p>
              <p className="text-[15px] text-[#4f3e34]">
                Mandamos 6 números para <span className="font-semibold text-[#1c120d]">{sentTo}</span> pelo WhatsApp do {menu.establishment.name}.
              </p>
            </div>
            <label className="block">
              <span className="sr-only">Código de 6 números</span>
              <input
                ref={codeRef}
                value={code}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
                  setCode(digits)
                  if (digits.length === CODE_LENGTH) void verify(digits)
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                className={`h-16 w-full rounded-2xl bg-white text-center text-3xl font-semibold tracking-[0.5em] outline-none ring-1 ring-[#e6d3bb] placeholder:text-[#d9c4aa] focus:ring-2 focus:ring-brand-500 ${DISPLAY_FONT}`}
              />
            </label>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
            <button
              type="button"
              onClick={() => void verify(code)}
              disabled={busy || code.length !== CODE_LENGTH}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-bold text-white shadow-md shadow-brand-600/25 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Entrar
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => setStep('phone')} className="font-semibold text-[#4f3e34]">
                Trocar número
              </button>
              {resendIn > 0 ? (
                <span className="text-[#6b574b]">Reenviar em 0:{String(resendIn).padStart(2, '0')}</span>
              ) : (
                <button type="button" onClick={() => void sendCode()} disabled={busy} className="font-semibold text-brand-700">
                  Reenviar código
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

function orderSummary(order: StorefrontAccountOrder): string {
  const names = order.items.map((item) => (item.quantity > 1 ? `${item.quantity} ${item.name}` : item.name))
  return names.length > 2 ? `${names.slice(0, 2).join(' + ')} +${names.length - 2}` : names.join(' + ')
}

function orderDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' })
}

/** Minha conta: últimos pedidos (repetir), endereços usados, pagamento e sair. */
export function AccountSheet({
  menu,
  account,
  onClose,
  onRepeat,
  onSignOut,
}: {
  menu: StorefrontMenu
  account: StorefrontAccount
  onClose: () => void
  onRepeat: (order: StorefrontAccountOrder) => void
  onSignOut: () => void
}) {
  const payment = menu.paymentMethods.find((method) => method.name === account.lastPaymentMethod)
  const orders = account.recentOrders.filter((order) => order.items.length > 0)
  return (
    <BottomSheet title="Minha conta" onClose={onClose}>
      <div className="space-y-5 px-4 pb-6">
        <div className="flex items-center gap-3 px-1">
          <AccountAvatar account={account} className="h-14 w-14 text-lg" />
          <div>
            <p className={`text-xl font-semibold ${DISPLAY_FONT}`}>{account.name ?? 'Olá!'}</p>
            <p className="text-sm text-[#6b574b]">{account.phoneLabel}</p>
          </div>
        </div>

        <AccountSection title="Últimos pedidos">
          {orders.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#6b574b]">Seus pedidos aparecem aqui.</p>
          ) : (
            orders.map((order, index) => (
              <div key={order.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{orderSummary(order)}</p>
                  <p className="text-xs text-[#6b574b]">
                    {orderDate(order.createdAt)}
                    {order.number ? ` · #${order.number}` : ''} · {formatBRL(order.total)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRepeat(order)}
                  className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold ${
                    index === 0 ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'
                  }`}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Repetir
                </button>
              </div>
            ))
          )}
        </AccountSection>

        <AccountSection title="Endereços">
          {account.addresses.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#6b574b]">O endereço da próxima entrega fica guardado aqui.</p>
          ) : (
            account.addresses.map((address, index) => (
              <div key={address} className="flex items-start gap-3 px-4 py-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                <p className="flex-1 text-sm">{address}</p>
                {index === 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Último</span>}
              </div>
            ))
          )}
        </AccountSection>

        {payment && (
          <AccountSection title="Pagamento preferido">
            <div className="flex items-center gap-3 px-4 py-3">
              <Wallet className="h-4 w-4 text-brand-700" aria-hidden="true" />
              <p className="text-sm font-semibold">{payment.label}</p>
            </div>
          </AccountSection>
        )}

        <button type="button" onClick={onSignOut} className="mx-auto flex items-center gap-2 py-2 text-sm font-semibold text-[#6b574b]">
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sair deste aparelho
        </button>
      </div>
    </BottomSheet>
  )
}

function AccountSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-[#6b574b]">{title}</h3>
      <div className="divide-y divide-[#f3e8da] rounded-2xl bg-white shadow-sm ring-1 ring-[#f0e2cf]">{children}</div>
    </section>
  )
}
