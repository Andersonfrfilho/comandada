import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BRANDING_SETTING_KEYS, BRAND_LOGO_MAX_SIZE, DEFAULT_BRANDING } from '@/constants/branding'
import { extractBrandColor, isHexColor, resizeImageToDataUrl } from '@/lib/branding'
import { useBrandingStore } from '@/stores/brandingStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { FiscalSettingsPage } from './FiscalSettingsPage'
import { DeliveryFeeManager } from './components/DeliveryFeeManager'
import { OnlinePaymentSettings } from './components/OnlinePaymentSettings'
import {
  SETTING_FIELDS,
  SETTING_SECTIONS,
  WEEK_DAYS,
  parseSettingValue,
  parseWorkingDays,
  settingToString,
  toggleWorkingDay,
  type SettingField,
  type SettingSection,
} from './settingsFields'
import { Upload, Image, X, Store, Receipt, Bike, CreditCard, ChevronDown, KeyRound, ChevronRight } from 'lucide-react'

type Tab = 'gerais' | 'fiscal' | 'delivery-fee' | 'payments'

const TABS: { key: Tab; label: string; icon: typeof Store }[] = [
  { key: 'gerais', label: 'Gerais', icon: Store },
  { key: 'fiscal', label: 'Fiscal', icon: Receipt },
  { key: 'delivery-fee', label: 'Entregas', icon: Bike },
  { key: 'payments', label: 'Pagamentos', icon: CreditCard },
]

const TAB_KEYS = new Set<string>(TABS.map((tab) => tab.key))

const INPUT_CLASS =
  'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500'

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-5 md:p-6 mb-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const loadBrandingForEstablishment = useBrandingStore((state) => state.loadForEstablishment)

  // A aba fica no endereço (?aba=payments): dá para mandar o link direto e o voltar do navegador funciona.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('aba') ?? 'gerais'
  const tab: Tab = TAB_KEYS.has(tabParam) ? (tabParam as Tab) : 'gerais'
  function selectTab(next: Tab) {
    setSearchParams(next === 'gerais' ? {} : { aba: next }, { replace: true })
  }

  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [logoColorNote, setLogoColorNote] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, unknown>>('/settings', accessToken ?? undefined),
    enabled: tab === 'gerais',
  })

  useEffect(() => {
    const keys = Object.keys(settings)
    if (keys.length > 0) {
      const map: Record<string, string> = {}
      for (const key of keys) {
        map[key] = settingToString(settings[key])
      }
      setValues(map)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put('/settings', { key, value }, accessToken ?? undefined),
  })

  function savedValue(field: SettingField): string {
    if (field.key in settings) return settingToString(settings[field.key])
    return field.type === 'boolean' ? 'false' : ''
  }

  function getValue(field: SettingField): string {
    return values[field.key] ?? savedValue(field)
  }

  // Só vai para a API o que mudou: menos chamadas e nenhum campo regravado sem querer.
  const changedFields = SETTING_FIELDS.filter((field) => {
    const current = values[field.key]
    return current !== undefined && current !== savedValue(field)
  })
  const hasChanges = changedFields.length > 0

  useEffect(() => {
    if (!hasChanges) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasChanges])

  async function handleSave() {
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await Promise.all(
        changedFields.map((field) =>
          saveMutation.mutateAsync({ key: field.key, value: parseSettingValue(field, values[field.key] ?? '') })
        )
      )
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      if (accessToken) void loadBrandingForEstablishment(accessToken)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    const map: Record<string, string> = {}
    for (const key of Object.keys(settings)) map[key] = settingToString(settings[key])
    setValues(map)
    setError(null)
  }

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  // O logo fica guardado na própria configuração, já reduzido: não depende de armazenamento de
  // arquivos e serve igual no login, no menu e no favicon.
  async function handleLogoUpload(file: File) {
    setUploadLoading(true)
    setUploadError(null)
    try {
      const logo = await resizeImageToDataUrl(file, BRAND_LOGO_MAX_SIZE)
      setValue(BRANDING_SETTING_KEYS.logo, logo)
      await saveMutation.mutateAsync({ key: BRANDING_SETTING_KEYS.logo, value: logo })
      await applyColorFromLogo(logo)
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
      if (accessToken) void loadBrandingForEstablishment(accessToken)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Não consegui ler a imagem')
    } finally {
      setUploadLoading(false)
    }
  }

  // A cor principal acompanha o logo: tirada da imagem e salva na hora. Dá para trocar depois.
  async function applyColorFromLogo(logo: string) {
    setLogoColorNote(null)
    const color = await extractBrandColor(logo).catch(() => null)
    if (!color) {
      setLogoColorNote('Não achei uma cor marcante no logo. Escolha a cor principal abaixo.')
      return
    }
    setValue(BRANDING_SETTING_KEYS.primaryColor, color)
    await saveMutation.mutateAsync({ key: BRANDING_SETTING_KEYS.primaryColor, value: color })
    void queryClient.invalidateQueries({ queryKey: ['settings'] })
    if (accessToken) void loadBrandingForEstablishment(accessToken)
    setLogoColorNote(`Cor principal ajustada para ${color.toUpperCase()}, tirada do logo. Pode trocar abaixo.`)
  }

  function handleLogoRemove() {
    setValue(BRANDING_SETTING_KEYS.logo, '')
    void saveMutation
      .mutateAsync({ key: BRANDING_SETTING_KEYS.logo, value: '' })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['settings'] })
        if (accessToken) void loadBrandingForEstablishment(accessToken)
      })
  }

  const logoUrl = values[BRANDING_SETTING_KEYS.logo] ?? settingToString(settings[BRANDING_SETTING_KEYS.logo])

  function fieldInput(field: SettingField) {
    const value = getValue(field)
    const inputId = `setting-${field.key}`

    if (field.type === 'color') {
      const color = isHexColor(value) ? value : DEFAULT_BRANDING.primaryColor
      return (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[12rem]">
            <input
              type="color"
              aria-label={`${field.label} (seletor)`}
              value={color}
              onChange={(e) => setValue(field.key, e.target.value)}
              className="h-10 w-12 shrink-0 rounded-lg border border-gray-300 cursor-pointer p-0.5 bg-white"
            />
            <input
              id={inputId}
              type="text"
              value={value}
              placeholder={DEFAULT_BRANDING.primaryColor}
              onChange={(e) => setValue(field.key, e.target.value)}
              className={`${INPUT_CLASS} font-mono uppercase max-w-[10rem]`}
            />
          </div>
          {logoUrl && (
            <Button variant="secondary" onClick={() => void applyColorFromLogo(logoUrl)}>
              Usar a cor do logo
            </Button>
          )}
        </div>
      )
    }

    if (field.type === 'days') {
      const chosen = new Set(parseWorkingDays(value))
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${inputId}-label`}>
          {WEEK_DAYS.map((day) => {
            const isOn = chosen.has(day.key)
            return (
              <button
                key={day.key}
                type="button"
                aria-pressed={isOn}
                onClick={() => setValue(field.key, toggleWorkingDay(value, day.key))}
                className={`min-w-[3.25rem] px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  isOn
                    ? 'bg-brand-600 border-brand-600 text-white hover:bg-brand-700'
                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {day.label}
              </button>
            )
          })}
        </div>
      )
    }

    const htmlType = field.type === 'number' ? 'number' : field.type === 'time' ? 'time' : field.type === 'tel' ? 'tel' : field.type === 'url' ? 'url' : 'text'
    return (
      <div className="relative">
        {field.prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{field.prefix}</span>
        )}
        <input
          id={inputId}
          type={htmlType}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => setValue(field.key, e.target.value)}
          step={field.step}
          min={field.type === 'number' ? '0' : undefined}
          inputMode={field.type === 'number' ? (field.step === '1' ? 'numeric' : 'decimal') : field.type === 'tel' ? 'numeric' : undefined}
          className={`${INPUT_CLASS} ${field.prefix ? 'pl-10' : ''} ${field.suffix ? 'pr-12' : ''}`}
        />
        {field.suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{field.suffix}</span>
        )}
      </div>
    )
  }

  function renderField(field: SettingField) {
    const inputId = `setting-${field.key}`
    return (
      <div key={field.key} className={field.wide ? 'col-span-2' : field.compact ? 'col-span-1' : 'col-span-2 sm:col-span-1'}>
        <label id={`${inputId}-label`} htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1.5">
          {field.label}
        </label>
        {fieldInput(field)}
        {field.description && <p className="text-xs text-gray-500 mt-1.5">{field.description}</p>}
      </div>
    )
  }

  function renderSwitch(field: SettingField) {
    const isOn = getValue(field) === 'true'
    const inputId = `setting-${field.key}`
    return (
      <div key={field.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
        <div className="min-w-0">
          <label htmlFor={inputId} className="text-sm font-medium text-gray-800 cursor-pointer">
            {field.label}
          </label>
          {field.description && <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>}
        </div>
        <button
          id={inputId}
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={() => setValue(field.key, isOn ? 'false' : 'true')}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            isOn ? 'bg-brand-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>
    )
  }

  function renderLogo() {
    return (
      <div className="flex items-start gap-4 pb-5 mb-5 border-b border-gray-100">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo do estabelecimento" className="w-full h-full object-contain" />
          ) : (
            <Image className="h-8 w-8 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 mb-2">Logo do restaurante</p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Button
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              loading={uploadLoading}
              loadingLabel="Enviando..."
            >
              <Upload className="h-3.5 w-3.5" />
              {logoUrl ? 'Trocar logo' : 'Enviar logo'}
            </Button>
            {logoUrl && (
              <Button size="sm" variant="secondary" onClick={handleLogoRemove} className="text-red-600">
                <X className="h-3.5 w-3.5" />
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            PNG, JPG ou GIF. O fundo liso (preto, branco...) sai sozinho. Aparece no login, no menu, na aba e na figurinha do WhatsApp.
          </p>
          {logoColorNote && <p className="mt-1 text-xs text-gray-600">{logoColorNote}</p>}
          {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              void handleLogoUpload(file)
              if (logoInputRef.current) logoInputRef.current.value = ''
            }}
            className="hidden"
          />
        </div>
      </div>
    )
  }

  function renderSection(section: SettingSection) {
    const fields = SETTING_FIELDS.filter((field) => field.section === section.key)
    if (section.key === 'funcionalidades') {
      return (
        <Card key={section.key} title={section.title} description={section.description}>
          <div className="divide-y divide-gray-100">{fields.map(renderSwitch)}</div>
        </Card>
      )
    }
    const mainFields = fields.filter((field) => !field.advanced)
    const advancedFields = fields.filter((field) => field.advanced)
    const advancedFilled = advancedFields.some((field) => getValue(field) !== '')
    return (
      <Card key={section.key} title={section.title} description={section.description}>
        {section.key === 'marca' && renderLogo()}
        <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-5">{mainFields.map(renderField)}</div>
        {advancedFields.length > 0 && (
          <details className="group mt-5 rounded-xl border border-gray-200" open={advancedFilled || undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 [&::-webkit-details-marker]:hidden">
              Ajuste fino do pin no mapa
              <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-5 px-4 pb-4">{advancedFields.map(renderField)}</div>
          </details>
        )}
      </Card>
    )
  }

  return (
    <div className={`p-4 md:p-6 max-w-3xl mx-auto ${tab === 'gerais' && hasChanges ? 'pb-28' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500">Dados do restaurante, horário, entregas, notas e pagamentos.</p>
        </div>
      </div>

      <div className="mb-5 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        <div role="tablist" aria-label="Seções das configurações" className="flex gap-1 bg-gray-100 rounded-xl p-1 min-w-max md:min-w-0">
          {TABS.map((item) => {
            const Icon = item.icon
            const isActive = tab === item.key
            return (
              <button
                key={item.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(item.key)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className={`hidden sm:block h-4 w-4 ${isActive ? 'text-brand-600' : ''}`} />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'gerais' && (
        <>
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}
          {saved && !hasChanges && (
            <div role="status" className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
              Configurações salvas.
            </div>
          )}
          {isLoading ? (
            <p className="text-gray-400 text-center py-16">Carregando...</p>
          ) : (
            <>
              {SETTING_SECTIONS.map(renderSection)}

              <a
                href="/change-password"
                className="flex items-center justify-between bg-white rounded-2xl shadow-sm p-5 md:px-6 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-gray-400" />
                  <span>
                    <span className="block text-base font-semibold text-gray-900">Segurança</span>
                    <span className="block text-sm text-gray-500">Alterar minha senha</span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </a>
            </>
          )}

          {hasChanges && (
            <div className="fixed inset-x-0 bottom-0 z-30 md:left-56 border-t border-gray-200 bg-white/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
              <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-4 md:px-6 py-3">
                <p className="text-sm text-gray-700">
                  {changedFields.length === 1 ? '1 alteração não salva' : `${changedFields.length} alterações não salvas`}
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleDiscard} disabled={saving}>
                    Descartar
                  </Button>
                  <Button onClick={() => void handleSave()} loading={saving} loadingLabel="Salvando...">
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'fiscal' && (
        <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
          <FiscalSettingsPage />
        </div>
      )}

      {tab === 'delivery-fee' && (
        <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
          <DeliveryFeeManager />
        </div>
      )}

      {tab === 'payments' && (
        <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
          <OnlinePaymentSettings />
        </div>
      )}
    </div>
  )
}
