import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Bike, Check, Loader2, Minus, Plus, Store, Trash2 } from 'lucide-react'
import { formatBRL } from '@/lib/listing'
import { MOTION } from './storefrontMotion'
import { ApiError } from '@/lib/api'
import {
  storefrontApi,
  type CustomerLookup,
  type DeliveryQuote,
  type StorefrontAccount,
  type StorefrontMenu,
  type StorefrontOrderType,
  type StorefrontPaymentMethod,
} from './storefrontApi'
import {
  EMPTY_ADDRESS,
  cartTotal,
  changeQuantity,
  composeAddress,
  isAddressComplete,
  isCompletePhone,
  maskCep,
  maskPhone,
  type AddressFields,
  type CartLine,
} from './storefrontFormat'
import { storefrontStorage } from './storefrontStorage'
import { BottomSheet } from './BottomSheet'

const ORDER_NOTE_MAX_LENGTH = 500
const LOOKUP_DELAY_MS = 450
const QUOTE_DELAY_MS = 700

/** `saved`: última entrega pelo telefone digitado (sem mostrar); `account:N`: endereço N de quem entrou. */
type AddressMode = 'saved' | 'new' | `account:${number}`

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: DeliveryQuote }
  | { status: 'error'; message: string }

function paymentHint(method: StorefrontPaymentMethod, orderType: StorefrontOrderType): string {
  const moment = orderType === 'delivery' ? 'na entrega' : 'na retirada'
  switch (method.kind) {
    case 'cash':
      return `Pague ${moment}`
    case 'card':
      return `Maquininha ${moment}`
    case 'pix':
      return 'A chave Pix aparece depois do pedido'
    case 'pix_online':
      return 'QR Code na hora, confirmação automática'
    case 'card_link':
      return 'Link para pagar com cartão agora'
  }
}

function parseMoney(value: string): number | null {
  const normalized = value.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const amount = Number.parseFloat(normalized)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function CheckoutSheet({
  menu,
  lines,
  onChangeLines,
  onClose,
  account = null,
}: {
  menu: StorefrontMenu
  lines: CartLine[]
  onChangeLines: (lines: CartLine[]) => void
  onClose: () => void
  /** Cliente que entrou com o WhatsApp: telefone confirmado, endereços e pagamento já vêm prontos. */
  account?: StorefrontAccount | null
}) {
  const navigate = useNavigate()
  const establishmentId = menu.establishment.id
  const profile = useMemo(() => storefrontStorage.loadProfile(establishmentId), [establishmentId])

  const [phone, setPhone] = useState(account ? maskPhone(account.phone) : (profile?.phone ?? ''))
  const [name, setName] = useState(account?.name ?? profile?.name ?? '')
  const [orderType, setOrderType] = useState<StorefrontOrderType>(() => {
    const preferred = profile?.orderType
    return preferred && menu.orderTypes.includes(preferred) ? preferred : (menu.orderTypes[0] ?? 'retirada')
  })
  const [address, setAddress] = useState<AddressFields>(profile?.address ?? EMPTY_ADDRESS)
  const [addressMode, setAddressMode] = useState<AddressMode>(account && account.addresses.length > 0 ? 'account:0' : 'new')
  const [paymentMethod, setPaymentMethod] = useState<string>(() => {
    const preferred = account?.lastPaymentMethod ?? profile?.paymentMethod
    return preferred && menu.paymentMethods.some((method) => method.name === preferred) ? preferred : ''
  })
  const [changeFor, setChangeFor] = useState('')
  const [notes, setNotes] = useState('')
  const [lookup, setLookup] = useState<CustomerLookup | null>(null)
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' })
  const [cepLoading, setCepLoading] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const itemsTotal = cartTotal(lines)
  const hasSavedAddressOnDevice = Boolean(profile?.address && isAddressComplete(profile.address))

  // Cliente que já pediu (pelo WhatsApp ou aqui): oferece o endereço da última entrega e a forma de pagamento.
  useEffect(() => {
    if (account || !isCompletePhone(phone)) {
      setLookup(null)
      return
    }
    const timer = setTimeout(() => {
      storefrontApi
        .lookupCustomer(establishmentId, phone)
        .then((result) => {
          setLookup(result)
          if (result.hasSavedAddress && !hasSavedAddressOnDevice) setAddressMode('saved')
          if (result.lastPaymentMethod) setPaymentMethod((current) => current || result.lastPaymentMethod || '')
        })
        .catch(() => setLookup(null))
    }, LOOKUP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [establishmentId, phone, hasSavedAddressOnDevice, account])

  const useSavedAddress = orderType === 'delivery' && addressMode === 'saved' && Boolean(lookup?.hasSavedAddress)
  const accountAddress = addressMode.startsWith('account:') ? (account?.addresses[Number(addressMode.slice('account:'.length))] ?? null) : null
  const typedAddress = isAddressComplete(address) ? composeAddress(address, menu.establishment.city) : ''
  const fullAddress = accountAddress ?? typedAddress

  // Taxa calculada pela API (mesma regra do bot) assim que o endereço fica completo.
  useEffect(() => {
    if (orderType !== 'delivery' || (!useSavedAddress && !fullAddress)) {
      setQuote({ status: 'idle' })
      return
    }
    setQuote({ status: 'loading' })
    const timer = setTimeout(() => {
      const body = useSavedAddress ? { phone, useSavedAddress: true, itemsTotal } : { address: fullAddress, itemsTotal }
      storefrontApi
        .quote(establishmentId, body)
        .then((result) => setQuote({ status: 'ready', quote: result }))
        .catch((error: unknown) =>
          setQuote({ status: 'error', message: error instanceof Error ? error.message : 'Não conseguimos calcular a taxa.' })
        )
    }, QUOTE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [establishmentId, orderType, useSavedAddress, fullAddress, phone, itemsTotal])

  async function fillFromCep(rawCep: string) {
    const digits = rawCep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = (await response.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (!data.erro) {
        setAddress((current) => ({
          ...current,
          street: data.logradouro || current.street,
          district: data.bairro || current.district,
          city: data.localidade ? `${data.localidade}/${data.uf ?? ''}`.replace(/\/$/, '') : current.city,
        }))
      }
    } catch {
      // Sem o CEP o cliente digita a rua; nada trava.
    } finally {
      setCepLoading(false)
    }
  }

  const deliveryFee = orderType === 'delivery' && quote.status === 'ready' ? quote.quote.feeAmount : 0
  const total = Math.round((itemsTotal + deliveryFee) * 100) / 100
  const selectedPayment = menu.paymentMethods.find((method) => method.name === paymentMethod)
  const changeAmount = selectedPayment?.kind === 'cash' ? parseMoney(changeFor) : null
  const minimum = menu.establishment.minOrderValue

  const errors: string[] = []
  if (lines.length === 0) errors.push('Seu carrinho está vazio.')
  if (minimum > 0 && itemsTotal < minimum) errors.push(`O pedido mínimo é ${formatBRL(minimum)} (faltam ${formatBRL(minimum - itemsTotal)}).`)
  if (!isCompletePhone(phone)) errors.push('Informe seu WhatsApp com DDD.')
  if (name.trim().length < 2) errors.push('Informe seu nome.')
  if (orderType === 'delivery' && !useSavedAddress && !accountAddress && !isAddressComplete(address)) errors.push('Complete o endereço (rua, número e bairro).')
  if (orderType === 'delivery' && quote.status === 'ready' && quote.quote.outOfRange) errors.push('Esse endereço fica fora da área de entrega.')
  if (!selectedPayment) errors.push('Escolha a forma de pagamento.')
  if (changeAmount !== null && changeAmount < total) errors.push('O troco precisa ser para um valor maior que o total.')

  const placeOrder = useMutation({
    mutationFn: () =>
      storefrontApi.placeOrder(establishmentId, {
        phone,
        name: name.trim(),
        orderType,
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, notes: line.notes || undefined })),
        ...(orderType === 'delivery'
          ? useSavedAddress
            ? { useSavedAddress: true }
            : accountAddress
              ? { address: accountAddress }
              : { address: fullAddress, complement: address.complement.trim() || undefined }
          : {}),
        paymentMethod,
        changeFor: changeAmount ?? undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (result) => {
      storefrontStorage.saveProfile(establishmentId, {
        phone,
        name: name.trim(),
        orderType,
        address: orderType === 'delivery' && !useSavedAddress && !accountAddress ? address : (profile?.address ?? null),
        paymentMethod,
      })
      storefrontStorage.saveRecentOrder(establishmentId, {
        orderId: result.orderId,
        token: result.trackingToken,
        number: result.number,
        createdAt: new Date().toISOString(),
      })
      storefrontStorage.saveLastOrderItems(establishmentId, lines)
      onChangeLines([])
      navigate(`/cardapio/pedido/${result.orderId}?t=${encodeURIComponent(result.trackingToken)}`, {
        state: { justPlaced: true, payment: result.payment },
      })
    },
    // O erro aparece na própria folha, acima do botão.
    onError: () => undefined,
  })

  function submit() {
    if (errors.length > 0) {
      setShowErrors(true)
      return
    }
    placeOrder.mutate()
  }

  const submitError = placeOrder.error instanceof ApiError || placeOrder.error instanceof Error ? placeOrder.error.message : null

  return (
    <BottomSheet title="Seu pedido" onClose={onClose} fullHeight>
      <div className="space-y-4 px-4 pb-4">
        <Section title="Itens">
          {lines.length === 0 ? (
            <p className="py-2 text-sm text-gray-500">Seu carrinho está vazio.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {lines.map((line) => (
                <li key={line.lineId} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{line.name}</p>
                    {line.notes && <p className="text-xs italic text-gray-500">{line.notes}</p>}
                    <p className="text-xs text-gray-500 tabular-nums">{formatBRL(line.unitPrice * line.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-stone-100 p-1">
                    <button
                      type="button"
                      onClick={() => onChangeLines(changeQuantity(lines, line.lineId, line.quantity - 1))}
                      aria-label={line.quantity === 1 ? `Tirar ${line.name}` : `Diminuir ${line.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm"
                    >
                      {line.quantity === 1 ? <Trash2 className="h-3.5 w-3.5 text-red-500" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onChangeLines(changeQuantity(lines, line.lineId, line.quantity + 1))}
                      aria-label={`Aumentar ${line.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={onClose} className="mt-1 text-sm font-semibold text-brand-700">
            + Adicionar mais itens
          </button>
        </Section>

        <Section title="Seus dados">
          {account ? (
            <div className="grid gap-3">
              <p className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Avisos no WhatsApp <span className="font-semibold text-gray-900">{account.phoneLabel}</span>
              </p>
              {!account.name && (
                <Field label="Nome">
                  <input value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} autoComplete="name" placeholder="Como podemos te chamar?" className={inputClass} />
                </Field>
              )}
            </div>
          ) : (
          <div className="grid gap-3">
            <Field label="WhatsApp" hint="Avisamos o andamento do pedido por lá.">
              <input
                value={phone}
                onChange={(event) => setPhone(maskPhone(event.target.value))}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(16) 99999-9999"
                className={inputClass}
              />
            </Field>
            <Field label="Nome">
              <input value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} autoComplete="name" placeholder="Como podemos te chamar?" className={inputClass} />
            </Field>
          </div>
          )}
        </Section>

        {menu.orderTypes.length > 0 && (
          <Section title="Como você quer receber?">
            <div className="grid grid-cols-2 gap-2">
              {menu.orderTypes.map((type) => (
                <ChoiceCard
                  key={type}
                  selected={orderType === type}
                  onSelect={() => setOrderType(type)}
                  icon={type === 'delivery' ? <Bike className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                  title={type === 'delivery' ? 'Entrega' : 'Retirar no local'}
                />
              ))}
            </div>

            {orderType === 'retirada' && menu.establishment.address && (
              <p className="mt-3 text-sm text-gray-600">
                Retire em <span className="font-medium text-gray-800">{menu.establishment.address}</span>
              </p>
            )}

            {orderType === 'delivery' && (
              <div className="mt-4 space-y-3">
                {account && account.addresses.length > 0 && (
                  <div className="grid gap-2">
                    {account.addresses.map((saved, index) => (
                      <RadioRow
                        key={saved}
                        selected={addressMode === `account:${index}`}
                        onSelect={() => setAddressMode(`account:${index}`)}
                        title={saved}
                        badge={index === 0 ? 'Último' : undefined}
                      />
                    ))}
                    <RadioRow selected={addressMode === 'new'} onSelect={() => setAddressMode('new')} title="Outro endereço" />
                  </div>
                )}
                {!account && lookup?.hasSavedAddress && (
                  <div className="grid gap-2">
                    <RadioRow
                      selected={addressMode === 'saved'}
                      onSelect={() => setAddressMode('saved')}
                      title="Mesmo endereço da última entrega"
                      description="O que você usou no último pedido com este WhatsApp."
                    />
                    <RadioRow selected={addressMode === 'new'} onSelect={() => setAddressMode('new')} title="Outro endereço" />
                  </div>
                )}
                {!useSavedAddress && !accountAddress && (
                  <div className="grid grid-cols-6 gap-3">
                    <Field label="CEP" className="col-span-3" hint={cepLoading ? 'Buscando…' : undefined}>
                      <input
                        value={address.cep}
                        onChange={(event) => {
                          const cep = maskCep(event.target.value)
                          setAddress((current) => ({ ...current, cep }))
                          void fillFromCep(cep)
                        }}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        placeholder="00000-000"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Número" className="col-span-3">
                      <input value={address.number} onChange={(event) => setAddress((current) => ({ ...current, number: event.target.value.slice(0, 20) }))} inputMode="numeric" placeholder="123" className={inputClass} />
                    </Field>
                    <Field label="Rua" className="col-span-6">
                      <input value={address.street} onChange={(event) => setAddress((current) => ({ ...current, street: event.target.value.slice(0, 160) }))} autoComplete="address-line1" placeholder="Rua, avenida…" className={inputClass} />
                    </Field>
                    <Field label="Bairro" className="col-span-6 sm:col-span-3">
                      <input value={address.district} onChange={(event) => setAddress((current) => ({ ...current, district: event.target.value.slice(0, 80) }))} placeholder="Bairro" className={inputClass} />
                    </Field>
                    <Field label="Complemento" className="col-span-6 sm:col-span-3">
                      <input value={address.complement} onChange={(event) => setAddress((current) => ({ ...current, complement: event.target.value.slice(0, 100) }))} placeholder="Apto, bloco, referência" className={inputClass} />
                    </Field>
                  </div>
                )}
                <DeliveryFeeLine quote={quote} />
              </div>
            )}
          </Section>
        )}

        <Section title="Pagamento">
          <div className="grid gap-2">
            {menu.paymentMethods.map((method) => (
              <RadioRow
                key={method.name}
                selected={paymentMethod === method.name}
                onSelect={() => setPaymentMethod(method.name)}
                title={method.label}
                description={paymentHint(method, orderType)}
                badge={(account?.lastPaymentMethod ?? lookup?.lastPaymentMethod) === method.name ? 'Último pedido' : undefined}
              />
            ))}
          </div>
          {selectedPayment?.kind === 'cash' && (
            <Field label="Troco para quanto?" hint="Deixe em branco se não precisar." className="mt-3">
              <input value={changeFor} onChange={(event) => setChangeFor(event.target.value.slice(0, 12))} inputMode="decimal" placeholder="Ex.: 100" className={inputClass} />
            </Field>
          )}
        </Section>

        <Section title="Observação do pedido">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, ORDER_NOTE_MAX_LENGTH))}
            rows={2}
            placeholder="Ex.: sem hashi, interfone quebrado (opcional)"
            className={`${inputClass} resize-none`}
          />
        </Section>
      </div>

      <div className="sticky bottom-0 border-t border-stone-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <dl className="mb-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <dt>Itens</dt>
            <dd className="tabular-nums">{formatBRL(itemsTotal)}</dd>
          </div>
          {orderType === 'delivery' && (
            <div className="flex justify-between text-gray-600">
              <dt>Entrega</dt>
              <dd className="tabular-nums">
                {quote.status === 'ready' ? (quote.quote.feeAmount === 0 ? 'Grátis' : formatBRL(quote.quote.feeAmount)) : '—'}
              </dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBRL(total)}</dd>
          </div>
        </dl>
        {showErrors && errors.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            {errors.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
        )}
        {submitError && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{submitError}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={placeOrder.isPending || !menu.establishment.isOpen || lines.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-4 font-semibold text-white shadow-md shadow-brand-600/25 transition disabled:opacity-50"
        >
          {placeOrder.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          {!menu.establishment.isOpen ? 'Estamos fechados agora' : placeOrder.isPending ? 'Enviando…' : `Fazer pedido · ${formatBRL(total)}`}
        </button>
      </div>
    </BottomSheet>
  )
}

const inputClass =
  'w-full rounded-xl bg-white px-3 py-2.5 text-[16px] text-gray-900 ring-1 ring-stone-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 sm:text-sm'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, hint, className = '', children }: { label: string; hint?: string | undefined; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  )
}

function ChoiceCard({ selected, onSelect, icon, title }: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold transition-colors duration-200 active:scale-[0.97] ${
        selected ? `bg-brand-50 text-brand-700 ring-2 ring-brand-500 ${MOTION.select}` : 'bg-white text-gray-700 ring-1 ring-stone-200'
      }`}
    >
      <span className={selected ? MOTION.hop : ''}>{icon}</span>
      {title}
    </button>
  )
}

function RadioRow({
  selected,
  onSelect,
  title,
  description,
  badge,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description?: string | undefined
  badge?: string | undefined
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-200 active:scale-[0.99] ${
        selected ? `bg-brand-50 ring-2 ring-brand-500 ${MOTION.select}` : 'bg-white ring-1 ring-stone-200'
      }`}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${selected ? 'bg-brand-600 text-white' : 'ring-1 ring-stone-300'}`}>
        {selected && <Check className={`h-3.5 w-3.5 ${MOTION.check}`} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {title}
          {badge && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-700">{badge}</span>}
        </span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
    </button>
  )
}

function DeliveryFeeLine({ quote }: { quote: QuoteState }) {
  if (quote.status === 'idle') return null
  if (quote.status === 'loading') {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando a taxa de entrega…
      </p>
    )
  }
  if (quote.status === 'error') return <p className="text-sm text-red-600">{quote.message}</p>
  const { feeAmount, outOfRange, freeShipping, distanceKm } = quote.quote
  if (outOfRange) return <p className="text-sm font-medium text-red-600">Esse endereço fica fora da nossa área de entrega. Que tal retirar no local?</p>
  return (
    <p className="text-sm text-gray-700">
      Taxa de entrega: <span className="font-semibold">{freeShipping || feeAmount === 0 ? 'grátis' : formatBRL(feeAmount)}</span>
      {distanceKm !== null && <span className="text-gray-400"> · {String(distanceKm).replace('.', ',')} km</span>}
    </p>
  )
}
