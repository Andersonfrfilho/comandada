import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Select } from '@/components/ui/Select'
import { CheckCircle, AlertCircle, Settings, Upload, Trash2 } from 'lucide-react'

interface FiscalConfig {
  id?: string
  model: 'sat' | 'nfce' | 'nfe' | 'none'
  environment: string
  cnpj: string | null
  inscricaoEstadual: string | null
  razaoSocial: string | null
  uf: string | null
  municipio: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  crt: string | null
  emitTrigger?: string
  emailProvider?: string
  providerConfig: Record<string, unknown>
  active: boolean
}

interface TestResult {
  ok: boolean
  message: string
}

const EMPTY_CONFIG: FiscalConfig = {
  model: 'none',
  environment: 'homologacao',
  cnpj: null,
  inscricaoEstadual: null,
  razaoSocial: null,
  uf: null,
  municipio: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  crt: '1',
  emitTrigger: 'on_payment',
  emailProvider: 'resend',
  providerConfig: {},
  active: false,
}

const CRT_OPTIONS = [
  { value: '1', label: '1 - Simples Nacional' },
  { value: '2', label: '2 - Simples (excesso sublimite)' },
  { value: '3', label: '3 - Regime Normal' },
]

export function FiscalSettingsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['fiscal-config'],
    queryFn: () => api.get<FiscalConfig | null>('/fiscal-config', accessToken ?? undefined),
  })

  const [form, setForm] = useState<FiscalConfig>(EMPTY_CONFIG)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [certFileName, setCertFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync config into form when loaded
  if (config && form.model === 'none' && !form.cnpj) {
    setForm({
      ...EMPTY_CONFIG,
      ...config,
      providerConfig: config.providerConfig ?? {},
    })
    // Detect if certificate is already stored (sanitized on GET, real on first load)
    const pc = config.providerConfig as Record<string, unknown>
    if (pc && pc['certificadoBase64'] && String(pc['certificadoBase64']).length > 50) {
      setCertFileName('certificado.pfx')
    }
  }

  const saveMutation = useMutation({
    mutationFn: (data: FiscalConfig) =>
      api.put('/fiscal-config', data, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fiscal-config'] })
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: Error) => setError(e.message),
  })

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.post<TestResult>(
        '/fiscal-config/test',
        {
          model: form.model,
          environment: form.environment,
          cnpj: form.cnpj,
          inscricaoEstadual: form.inscricaoEstadual,
          razaoSocial: form.razaoSocial,
          uf: form.uf,
          municipio: form.municipio,
          cep: form.cep,
          logradouro: form.logradouro,
          numero: form.numero,
          bairro: form.bairro,
          complemento: form.complemento,
          crt: form.crt ?? '1',
          providerConfig: form.providerConfig,
        },
        accessToken ?? undefined
      )
      setTestResult(result)
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Erro de conexão' })
    } finally {
      setTesting(false)
    }
  }

  function updateProviderConfig(key: string, value: string | number) {
    setForm((prev) => ({
      ...prev,
      providerConfig: { ...prev.providerConfig, [key]: value },
    }))
  }

  function handleCertificateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.pfx') && !file.name.endsWith('.p12')) {
      setError('Apenas arquivos .pfx ou .p12 são aceitos')
      return
    }
    setError(null)
    setCertFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] // Remove data:... prefix
      updateProviderConfig('certificadoBase64', base64)
    }
    reader.onerror = () => {
      setError('Erro ao ler o arquivo do certificado')
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveCertificate() {
    setCertFileName(null)
    updateProviderConfig('certificadoBase64', '')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function getProviderValue(key: string, defaultValue = ''): string {
    const val = (form.providerConfig as Record<string, unknown>)[key]
    return val !== undefined ? String(val) : defaultValue
  }

  if (isLoading) return <p className="text-gray-400 text-center py-16">Carregando...</p>

  const showNfce = form.model === 'nfce' || form.model === 'nfe'
  const showSat = form.model === 'sat'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider">
          <Settings className="h-4 w-4" />
          Configuração Fiscal
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => void handleTest()}
            disabled={testing || form.model === 'none'}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <AlertCircle className="h-4 w-4" />
            {testing ? 'Testando...' : 'Testar conexão'}
          </button>
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            {saveMutation.isPending ? 'Salvando...' : saved ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {testResult && (
        <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
          testResult.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {testResult.ok ? (
            <>
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              Conexão OK
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Erro: {testResult.message}
            </>
          )}
        </div>
      )}

      {/* Modelo fiscal */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Modelo Fiscal</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'none', label: 'Nenhum' },
            { value: 'nfce', label: 'NFC-e' },
            { value: 'sat', label: 'SAT' },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setForm((prev) => ({ ...prev, model: opt.value }))}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                form.model === opt.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {form.model !== 'none' && (
        <>
          {/* Ambiente */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Ambiente</label>
            <div className="flex gap-2">
              <button
                onClick={() => setForm((prev) => ({ ...prev, environment: 'homologacao' }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  form.environment === 'homologacao'
                    ? 'bg-yellow-100 text-yellow-800 border-yellow-400'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Homologação
              </button>
              <button
                onClick={() => {
                  if (form.environment !== 'producao' && !window.confirm('Tem certeza que deseja mudar para Produção? As notas serão emitidas oficialmente.')) return
                  setForm((prev) => ({ ...prev, environment: 'producao' }))
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  form.environment === 'producao'
                    ? 'bg-green-100 text-green-800 border-green-400'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Produção
              </button>
            </div>
          </div>

          {/* Emissão automática + envio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Emitir NF quando</label>
              <Select
                value={form.emitTrigger ?? 'on_payment'}
                onChange={(value) => setForm((prev) => ({ ...prev, emitTrigger: value }))}
                options={[
                  { value: 'on_payment', label: 'Ao registrar pagamento' },
                  { value: 'on_completed', label: 'Ao concluir o pedido' },
                  { value: 'manual', label: 'Somente manual' },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Provedor de e-mail</label>
              <Select
                value={form.emailProvider ?? 'resend'}
                onChange={(value) => setForm((prev) => ({ ...prev, emailProvider: value }))}
                options={[
                  { value: 'resend', label: 'Resend' },
                  { value: 'smtp', label: 'SMTP' },
                ]}
              />
            </div>
          </div>

          {/* Dados do emitente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
              { key: 'cnpj', label: 'CNPJ', placeholder: '00000000000100', max: 14 },
              { key: 'razaoSocial', label: 'Razão Social', max: 255 },
              { key: 'inscricaoEstadual', label: 'Inscrição Estadual', placeholder: 'ISENTO', max: 50 },
              { key: 'uf', label: 'UF', placeholder: 'SP', max: 2 },
              { key: 'municipio', label: 'Município', max: 100 },
              { key: 'cep', label: 'CEP', placeholder: '00000000', max: 8 },
              { key: 'logradouro', label: 'Logradouro', max: 255 },
              { key: 'numero', label: 'Número', max: 20 },
              { key: 'complemento', label: 'Complemento', max: 100 },
              { key: 'bairro', label: 'Bairro', max: 100 },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                <input
                  value={(form as unknown as Record<string, unknown>)[field.key] as string ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value || null }))}
                  placeholder={field.placeholder}
                  maxLength={field.max}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CRT</label>
              <Select
                value={form.crt ?? '1'}
                onChange={(value) => setForm((prev) => ({ ...prev, crt: value }))}
                options={CRT_OPTIONS}
              />
            </div>
          </div>

          {/* Configurações NFC-e */}
          {showNfce && (
            <div className="border-t border-gray-200 pt-4 mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Certificado Digital A1 (NFC-e)</h3>
              <div className="space-y-3">
                {/* Upload do certificado */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Arquivo do certificado (.pfx ou .p12)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pfx,.p12"
                    onChange={handleCertificateUpload}
                    className="hidden"
                    id="cert-upload"
                  />
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="cert-upload"
                      className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      Selecionar arquivo
                    </label>
                    {certFileName ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded truncate">
                          {certFileName}
                        </span>
                        <button
                          onClick={handleRemoveCertificate}
                          className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                          title="Remover certificado"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Nenhum certificado enviado</span>
                    )}
                  </div>
                </div>

                {/* Senha */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Senha do certificado</label>
                  <input
                    type="password"
                    value={getProviderValue('certificadoSenha')}
                    onChange={(e) => updateProviderConfig('certificadoSenha', e.target.value)}
                    placeholder="Senha do arquivo .pfx"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {[
                  { key: 'serie', label: 'Série', placeholder: '1' },
                  { key: 'numeroNf', label: 'Número NFC-e inicial', placeholder: '1', type: 'number' },
                  { key: 'codigoMunicipio', label: 'Código IBGE Município', placeholder: '3550308' },
                  { key: 'cscId', label: 'CSC ID', placeholder: 'ID do CSC' },
                  { key: 'cscToken', label: 'CSC Token', placeholder: 'Token obtido na SEFAZ' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                    <input
                      type={field.type ?? 'text'}
                      value={getProviderValue(field.key)}
                      onChange={(e) => updateProviderConfig(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Configurações SAT */}
          {showSat && (
            <div className="border-t border-gray-200 pt-4 mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Equipamento SAT</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: 'satUrl', label: 'URL do SAT', placeholder: 'http://localhost:8080/sat' },
                  { key: 'activationCode', label: 'Código de ativação' },
                  { key: 'signatureAC', label: 'Assinatura AC do fabricante' },
                ].map((field) => (
                  <div key={field.key} className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                    <input
                      value={getProviderValue(field.key)}
                      onChange={(e) => updateProviderConfig(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ativo */}
          <div className="flex items-center justify-between py-2 border-t border-gray-200">
            <span className="text-sm text-gray-700">Ativar emissão fiscal</span>
            <button
              onClick={() => setForm((prev) => ({ ...prev, active: !prev.active }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.active ? 'bg-brand-600' : 'bg-gray-200'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
