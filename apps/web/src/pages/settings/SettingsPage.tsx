import { useState, useEffect, useRef } from 'react'
import { BRANDING_SETTING_KEYS, BRAND_LOGO_MAX_SIZE, DEFAULT_BRANDING } from '@/constants/branding'
import { extractBrandColor, isHexColor, resizeImageToDataUrl } from '@/lib/branding'
import { useBrandingStore } from '@/stores/brandingStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { FiscalSettingsPage } from './FiscalSettingsPage'
import { DeliveryFeeManager } from './components/DeliveryFeeManager'
import { OnlinePaymentSettings } from './components/OnlinePaymentSettings'
import { Upload, Image, X } from 'lucide-react'
import { API_URL } from '@/lib/apiEndpoints'

interface SettingDef {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'color'
  description?: string
  section: 'marca' | 'estabelecimento' | 'operacao' | 'estoque' | 'impressao' | 'funcionalidades' | 'gerais'
}

const KNOWN_SETTINGS: SettingDef[] = [
  { key: BRANDING_SETTING_KEYS.name, label: 'Nome exibido no painel', type: 'text', description: 'Aparece no login, no menu, na aba do navegador e no rodapé', section: 'marca' },
  { key: BRANDING_SETTING_KEYS.primaryColor, label: 'Cor principal', type: 'color', description: 'Botões, destaques e menu ativo usam esta cor', section: 'marca' },
  { key: BRANDING_SETTING_KEYS.domains, label: 'Domínios do painel', type: 'text', description: 'Separados por vírgula. Quem abrir o painel por um destes endereços já vê a sua marca no login', section: 'marca' },
  { key: 'establishment_name', label: 'Nome do estabelecimento', type: 'text', section: 'estabelecimento' },
  { key: 'whatsapp_number', label: 'Número WhatsApp', type: 'text', description: 'Formato: 5511999999999', section: 'estabelecimento' },
  { key: 'establishment_address', label: 'Endereço completo', type: 'text', section: 'estabelecimento' },

  { key: 'opening_time', label: 'Abre às', type: 'text', description: 'Formato HH:MM, ex.: 18:00', section: 'operacao' },
  { key: 'closing_time', label: 'Fecha às', type: 'text', description: 'Formato HH:MM, ex.: 23:00', section: 'operacao' },
  { key: 'working_days', label: 'Dias de funcionamento', type: 'text', description: 'Separados por vírgula: seg,ter,qua,qui,sex,sab,dom', section: 'operacao' },
  { key: 'ignore_hours', label: 'Bot atende fora do horário', type: 'boolean', description: 'Ligado, o bot atende a qualquer hora (útil para testes)', section: 'funcionalidades' },
  { key: 'default_preparation_time', label: 'Tempo de preparo padrão (min)', type: 'number', section: 'operacao' },
  { key: 'minimum_delivery_order', label: 'Pedido mínimo para delivery (R$)', type: 'number', section: 'operacao' },
  { key: 'currency', label: 'Moeda', type: 'text', section: 'operacao' },
  { key: 'timezone', label: 'Fuso horário', type: 'text', section: 'operacao' },

  { key: 'expiry_alert_days', label: 'Dias de alerta de validade', type: 'number', section: 'estoque' },

  { key: 'default_printer', label: 'Impressora padrão', type: 'text', section: 'impressao' },

  { key: 'delivery_fee', label: 'Taxa de entrega (R$)', type: 'number', section: 'gerais' },
  { key: 'min_order_amount', label: 'Pedido mínimo (R$)', type: 'number', section: 'gerais' },
  { key: 'estimated_delivery_time', label: 'Tempo estimado de entrega (min)', type: 'number', section: 'gerais' },
  { key: 'estimated_pickup_time', label: 'Tempo estimado de retirada (min)', type: 'number', section: 'gerais' },

  { key: 'accept_orders', label: 'Aceitar pedidos', type: 'boolean', section: 'funcionalidades' },
  { key: 'accept_delivery', label: 'Aceitar entregas', type: 'boolean', section: 'funcionalidades' },
  { key: 'accept_pickup', label: 'Aceitar retirada', type: 'boolean', section: 'funcionalidades' },
  { key: 'accept_table', label: 'Aceitar pedidos na mesa', type: 'boolean', section: 'funcionalidades' },
]

interface SectionConfig {
  key: string
  title: string
}

const SECTIONS: SectionConfig[] = [
  { key: 'marca', title: 'Marca' },
  { key: 'estabelecimento', title: 'Estabelecimento' },
  { key: 'operacao', title: 'Operação' },
  { key: 'estoque', title: 'Estoque' },
  { key: 'impressao', title: 'Impressão' },
  { key: 'gerais', title: 'Informações gerais' },
  { key: 'funcionalidades', title: 'Funcionalidades' },
]

function toString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

type Tab = 'gerais' | 'fiscal' | 'delivery-fee' | 'payments'

export function SettingsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const loadBrandingForEstablishment = useBrandingStore((state) => state.loadForEstablishment)

  const [tab, setTab] = useState<Tab>('gerais')
  const [values, setValues] = useState<Record<string, string>>({})
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
        map[key] = toString(settings[key])
      }
      setValues(map)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put('/settings', { key, value }, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  async function handleSave() {
    setError(null)
    setSaved(false)
    const promises = KNOWN_SETTINGS.map((def) => {
      const raw = values[def.key]
      if (raw === undefined) return Promise.resolve()
      let parsed: unknown = raw
      if (def.type === 'number') parsed = raw === '' ? null : Number(raw)
      if (def.type === 'boolean') parsed = raw === 'true'
      return saveMutation.mutateAsync({ key: def.key, value: parsed })
    })
    await Promise.all(promises)
    if (accessToken) void loadBrandingForEstablishment(accessToken)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function getValue(key: string, type: SettingDef['type']): string {
    const v = values[key]
    if (v !== undefined) return v
    if (key in settings) return toString(settings[key])
    return type === 'boolean' ? 'false' : ''
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
    if (accessToken) void loadBrandingForEstablishment(accessToken)
    setLogoColorNote(`Cor principal ajustada para ${color.toUpperCase()}, tirada do logo. Pode trocar abaixo.`)
  }

  function handleLogoRemove() {
    setValue(BRANDING_SETTING_KEYS.logo, '')
    void saveMutation
      .mutateAsync({ key: BRANDING_SETTING_KEYS.logo, value: '' })
      .then(() => {
        if (accessToken) void loadBrandingForEstablishment(accessToken)
      })
  }

  const logoUrl = getValue(BRANDING_SETTING_KEYS.logo, 'text')

  const fieldsBySection = new Map<string, SettingDef[]>()
  for (const def of KNOWN_SETTINGS) {
    const list = fieldsBySection.get(def.section) ?? []
    list.push(def)
    fieldsBySection.set(def.section, list)
  }

  const renderTextField = (def: SettingDef) => (
    <div key={def.key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{def.label}</label>
      {def.type === 'color' && (
        <input
          type="color"
          aria-label={def.label}
          value={isHexColor(getValue(def.key, def.type)) ? getValue(def.key, def.type) : DEFAULT_BRANDING.primaryColor}
          onChange={(e) => setValue(def.key, e.target.value)}
          className="h-10 w-16 mb-2 rounded-lg border border-gray-300 cursor-pointer"
        />
      )}
      {def.type === 'color' && logoUrl && (
        <button
          type="button"
          onClick={() => void applyColorFromLogo(logoUrl)}
          className="ml-3 mb-2 align-top px-3 py-2 text-xs font-medium text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
        >
          Usar a cor do logo
        </button>
      )}
      <input
        type={def.type === 'number' ? 'number' : 'text'}
        value={getValue(def.key, def.type)}
        onChange={(e) => setValue(def.key, e.target.value)}
        step={def.type === 'number' ? '0.01' : undefined}
        min={def.type === 'number' ? '0' : undefined}
        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {def.description && (
        <p className="text-xs text-gray-400 mt-1">{def.description}</p>
      )}
    </div>
  )

  const renderBoolField = (def: SettingDef) => {
    const isOn = getValue(def.key, 'boolean') === 'true'
    return (
      <div key={def.key} className="flex items-center justify-between py-1">
        <span className="text-sm text-gray-700">{def.label}</span>
        <button
          onClick={() => setValue(def.key, isOn ? 'false' : 'true')}
          className={`relative w-11 h-6 rounded-full transition-colors ${isOn ? 'bg-brand-600' : 'bg-gray-200'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
        {tab === 'gerais' && (
          <button
            onClick={() => void handleSave()}
            disabled={saveMutation.isPending}
            className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-95"
          >
            {saveMutation.isPending ? 'Salvando...' : saved ? '✓ Salvo' : 'Salvar'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {([
          { key: 'gerais', label: 'Gerais' },
          { key: 'fiscal', label: 'Fiscal' },
          { key: 'delivery-fee', label: 'Entregas' },
          { key: 'payments', label: 'Pagamentos' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {tab === 'gerais' && (
        <>
          {isLoading ? (
            <p className="text-gray-400 text-center py-16">Carregando...</p>
          ) : (
            <>
              {/* Logo upload section (T8.1) */}
              <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Logo do restaurante</h2>
                <div className="flex items-start gap-4">
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {logoUrl ? (
                      <div className="relative w-full h-full group">
                        <img
                          src={logoUrl}
                          alt="Logo do estabelecimento"
                          className="w-full h-full object-contain bg-black"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none'
                            ;(e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex'
                          }}
                        />
                        <div className="hidden absolute inset-0 bg-black/50 group-hover:flex items-center justify-center" />
                      </div>
                    ) : (
                      <Image className="h-8 w-8 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploadLoading ? 'Enviando...' : 'Fazer upload'}
                      </button>
                      {logoUrl && (
                        <button
                          onClick={handleLogoRemove}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      PNG, JPG ou GIF. Aparece no login, no menu e como ícone da aba.
                    </p>
                    {logoColorNote && (
                      <p className="mt-1 text-xs text-gray-500">{logoColorNote}</p>
                    )}
                    {uploadError && (
                      <p className="mt-1 text-xs text-red-500">{uploadError}</p>
                    )}
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
              </div>

              {/* Sections with text/number fields */}
              {SECTIONS.filter((s) => s.key !== 'funcionalidades').map((section) => {
                const fields = fieldsBySection.get(section.key) ?? []
                if (fields.length === 0) return null
                const nonBoolFields = fields.filter((f) => f.type !== 'boolean')
                if (nonBoolFields.length === 0) return null

                return (
                  <div key={section.key} className="bg-white rounded-2xl shadow-sm p-5 mb-4 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{section.title}</h2>
                    {nonBoolFields.map(renderTextField)}
                  </div>
                )
              })}

              {/* Boolean toggles */}
              <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Funcionalidades</h2>
                {(fieldsBySection.get('funcionalidades') ?? []).map(renderBoolField)}
              </div>

              {/* Change password link */}
              <div className="mt-4 bg-white rounded-2xl shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Segurança</h2>
                <a
                  href="/change-password"
                  className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  Alterar minha senha →
                </a>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'fiscal' && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <FiscalSettingsPage />
        </div>
      )}

      {tab === 'delivery-fee' && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <DeliveryFeeManager />
        </div>
      )}

      {tab === 'payments' && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <OnlinePaymentSettings />
        </div>
      )}
    </div>
  )
}
