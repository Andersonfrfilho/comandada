import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface PaymentAccount {
  provider: string
  connected: boolean
  active: boolean
  accessTokenHint: string | null
  hasWebhookSecret: boolean
  payerEmail: string | null
  pixEnabled: boolean
  cardLinkEnabled: boolean
  expirationMinutes: number
  webhookUrl: string
}

interface PaymentAccountForm {
  accessToken: string
  webhookSecret: string
  payerEmail: string
  pixEnabled: boolean
  cardLinkEnabled: boolean
  expirationMinutes: number
  active: boolean
}

const PAYMENT_ACCOUNT_QUERY_KEY = ['settings', 'payments']
const MERCADO_PAGO_CREDENTIALS_URL = 'https://www.mercadopago.com.br/developers/panel/app'

const EMPTY_FORM: PaymentAccountForm = {
  accessToken: '',
  webhookSecret: '',
  payerEmail: '',
  pixEnabled: true,
  cardLinkEnabled: true,
  expirationMinutes: 30,
  active: true,
}

// Conta Mercado Pago do restaurante: o cliente paga pelo WhatsApp e o dinheiro cai direto nela.
export function OnlinePaymentSettings() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PaymentAccountForm>(EMPTY_FORM)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: account, isLoading } = useQuery({
    queryKey: PAYMENT_ACCOUNT_QUERY_KEY,
    queryFn: () => api.get<PaymentAccount>('/settings/payments', accessToken ?? undefined),
  })

  useEffect(() => {
    if (!account) return
    setForm({
      accessToken: '',
      webhookSecret: '',
      payerEmail: account.payerEmail ?? '',
      pixEnabled: account.pixEnabled,
      cardLinkEnabled: account.cardLinkEnabled,
      expirationMinutes: account.expirationMinutes,
      active: account.connected ? account.active : true,
    })
  }, [account])

  const saveMutation = useMutation({
    mutationFn: (data: PaymentAccountForm) =>
      api.put<PaymentAccount>(
        '/settings/payments',
        {
          provider: 'mercadopago',
          accessToken: data.accessToken || undefined,
          webhookSecret: data.webhookSecret || undefined,
          payerEmail: data.payerEmail || null,
          pixEnabled: data.pixEnabled,
          cardLinkEnabled: data.cardLinkEnabled,
          expirationMinutes: data.expirationMinutes,
          active: data.active,
        },
        accessToken ?? undefined
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(PAYMENT_ACCOUNT_QUERY_KEY, updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  function update<TKey extends keyof PaymentAccountForm>(key: TKey, value: PaymentAccountForm[TKey]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function copyWebhookUrl() {
    if (!account) return
    await navigator.clipboard.writeText(account.webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) return <p className="text-sm text-gray-500">Carregando…</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Pagamento pelo WhatsApp (Mercado Pago)</h2>
        <p className="text-sm text-gray-500 mt-1">
          O bot manda Pix (copia e cola) ou link de cartão quando o cliente fecha o pedido. O dinheiro cai direto na
          sua conta Mercado Pago, e o pedido só vai para a cozinha depois que o pagamento for confirmado.
        </p>
        <p className="text-sm mt-2">
          Status:{' '}
          {account?.connected ? (
            <span className="font-medium text-green-700">
              conta ligada (token …{account.accessTokenHint}){account.active ? '' : ' — desativada'}
            </span>
          ) : (
            <span className="font-medium text-gray-600">não ligada</span>
          )}
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Access token de produção</span>
          <input
            type="password"
            autoComplete="off"
            value={form.accessToken}
            onChange={(event) => update('accessToken', event.target.value)}
            placeholder={account?.connected ? 'Deixe em branco para manter o atual' : 'APP_USR-...'}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-gray-500">
            Em{' '}
            <a href={MERCADO_PAGO_CREDENTIALS_URL} target="_blank" rel="noreferrer" className="text-brand-600 underline">
              Suas integrações
            </a>{' '}
            → sua aplicação → Credenciais de produção. Para testar, use o token de teste (TEST-...).
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Assinatura secreta do webhook</span>
          <input
            type="password"
            autoComplete="off"
            value={form.webhookSecret}
            onChange={(event) => update('webhookSecret', event.target.value)}
            placeholder={account?.hasWebhookSecret ? 'Deixe em branco para manter a atual' : ''}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div>
          <span className="text-sm font-medium text-gray-700">URL do webhook</span>
          <div className="mt-1 flex gap-2">
            <input readOnly value={account?.webhookUrl ?? ''} className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs" />
            <button
              type="button"
              onClick={() => void copyWebhookUrl()}
              className="rounded-lg border border-gray-300 px-3 text-sm"
              aria-label="Copiar URL do webhook"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <span className="text-xs text-gray-500">
            Cole em Suas integrações → Webhooks, marque o evento “Pagamentos” e copie a assinatura secreta para o campo acima.
          </span>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">E-mail para o Pix</span>
          <input
            type="email"
            value={form.payerEmail}
            onChange={(event) => update('payerEmail', event.target.value)}
            placeholder="financeiro@seurestaurante.com"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-gray-500">O Mercado Pago exige um e-mail no Pix; quem compra pelo WhatsApp não informa.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Prazo para pagar (minutos)</span>
          <input
            type="number"
            min={30}
            max={1440}
            value={form.expirationMinutes}
            onChange={(event) => update('expirationMinutes', Number(event.target.value))}
            className="mt-1 w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="block text-xs text-gray-500">Passou do prazo sem pagar, o pedido é cancelado e o cliente é avisado.</span>
        </label>

        <div className="space-y-2">
          {(
            [
              ['pixEnabled', 'Cobrar Pix pelo WhatsApp'],
              ['cardLinkEnabled', 'Oferecer cartão pelo link de pagamento'],
              ['active', 'Pagamento online ligado'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form[key]} onChange={(event) => update(key, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setError(null)
          saveMutation.mutate(form)
        }}
        disabled={saveMutation.isPending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Salvando…' : saved ? 'Salvo ✓' : 'Salvar'}
      </button>
    </div>
  )
}
