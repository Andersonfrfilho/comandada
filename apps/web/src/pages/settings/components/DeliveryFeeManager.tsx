import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { ChevronDown, ChevronRight, Plus, Trash2, Edit3 } from 'lucide-react'

interface FeeRule {
  id: number
  orderTypeId: number
  establishmentId: string
  mode: string
  baseFee: string
  perKmRate: string
  perMinRate: string
  freeAbove: string
  maxRadiusKm: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface FeeZone {
  id: number
  deliveryFeeRuleId: number
  establishmentId: string
  zoneType: string
  minValue: string
  maxValue: string
  fee: string
  label: string | null
  active: boolean
}

const MODE_LABELS: Record<string, string> = {
  fixed: 'Taxa fixa',
  per_km: 'Por km',
  per_route_min: 'Por minuto de rota',
  zones_km: 'Por faixa de km',
  zones_min: 'Por faixa de minuto',
}

const MODE_OPTIONS = Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }))

const ZONE_TYPE_OPTIONS = [
  { value: 'km', label: 'Quilômetros' },
  { value: 'min', label: 'Minutos' },
]

function toNumber(val: string | number): string {
  const n = Number(val)
  return isNaN(n) ? '0' : String(n)
}

interface RuleFormData {
  orderTypeId: number
  mode: string
  baseFee: number
  perKmRate: number
  perMinRate: number
  freeAbove: number
  maxRadiusKm: number
  active: boolean
}

const EMPTY_RULE: RuleFormData = {
  orderTypeId: 1,
  mode: 'fixed',
  baseFee: 0,
  perKmRate: 0,
  perMinRate: 0,
  freeAbove: 0,
  maxRadiusKm: 10,
  active: true,
}

interface ZoneFormData {
  zoneType: string
  minValue: number
  maxValue: number
  fee: number
  label: string
  active: boolean
}

const EMPTY_ZONE: ZoneFormData = {
  zoneType: 'km',
  minValue: 0,
  maxValue: 3,
  fee: 5,
  label: '',
  active: true,
}

export function DeliveryFeeManager() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['delivery-fee-rules'],
    queryFn: () => api.get<FeeRule[]>('/delivery-fee/rules', accessToken ?? undefined),
  })

  const [expandedRuleId, setExpandedRuleId] = useState<number | null>(null)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState<FeeRule | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleFormData>(EMPTY_RULE)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showZoneForm, setShowZoneForm] = useState<number | null>(null)
  const [editingZone, setEditingZone] = useState<FeeZone | null>(null)
  const [zoneForm, setZoneForm] = useState<ZoneFormData>(EMPTY_ZONE)

  const clearMessages = () => {
    setError(null)
    setSaved(false)
  }

  const createRuleMutation = useMutation({
    mutationFn: (data: RuleFormData) =>
      api.post<FeeRule>('/delivery-fee/rules', data, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-fee-rules'] })
      setSaved(true)
      setShowRuleForm(false)
      setRuleForm(EMPTY_RULE)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: Error) => setError(e.message),
  })

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RuleFormData> }) =>
      api.put<FeeRule>(`/delivery-fee/rules/${id}`, data, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-fee-rules'] })
      setSaved(true)
      setEditingRule(null)
      setShowRuleForm(false)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/delivery-fee/rules/${id}`, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-fee-rules'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const toggleRuleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.put<FeeRule>(`/delivery-fee/rules/${id}`, { active }, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-fee-rules'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const { data: zones = {}, refetch: refetchZones } = useQuery({
    queryKey: ['delivery-fee-zones', expandedRuleId],
    queryFn: async () => {
      if (expandedRuleId === null) return {}
      const result = await api.get<FeeZone[]>(
        `/delivery-fee/rules/${expandedRuleId}/zones`,
        accessToken ?? undefined
      )
      return { [expandedRuleId]: result }
    },
    enabled: expandedRuleId !== null,
  })

  const createZoneMutation = useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: number; data: ZoneFormData }) =>
      api.post<FeeZone>(`/delivery-fee/rules/${ruleId}/zones`, data, accessToken ?? undefined),
    onSuccess: () => {
      void refetchZones()
      void queryClient.invalidateQueries({ queryKey: ['delivery-fee-zones'] })
      setShowZoneForm(null)
      setZoneForm(EMPTY_ZONE)
    },
    onError: (e: Error) => setError(e.message),
  })

  const updateZoneMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ZoneFormData> }) =>
      api.put<FeeZone>(`/delivery-fee/zones/${id}`, data, accessToken ?? undefined),
    onSuccess: () => {
      void refetchZones()
      void queryClient.invalidateQueries({ queryKey: ['delivery-fee-zones'] })
      setEditingZone(null)
      setZoneForm(EMPTY_ZONE)
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteZoneMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/delivery-fee/zones/${id}`, accessToken ?? undefined),
    onSuccess: () => {
      void refetchZones()
    },
    onError: (e: Error) => setError(e.message),
  })

  function openNewRule() {
    clearMessages()
    setEditingRule(null)
    setRuleForm(EMPTY_RULE)
    setShowRuleForm(true)
  }

  function openEditRule(rule: FeeRule) {
    clearMessages()
    setShowRuleForm(true)
    setEditingRule(rule)
    setRuleForm({
      orderTypeId: rule.orderTypeId,
      mode: rule.mode,
      baseFee: Number(toNumber(rule.baseFee)),
      perKmRate: Number(toNumber(rule.perKmRate)),
      perMinRate: Number(toNumber(rule.perMinRate)),
      freeAbove: Number(toNumber(rule.freeAbove)),
      maxRadiusKm: Number(toNumber(rule.maxRadiusKm)),
      active: rule.active,
    })
  }

  function openNewZone(ruleId: number) {
    clearMessages()
    setEditingZone(null)
    setZoneForm(EMPTY_ZONE)
    setShowZoneForm(ruleId)
  }

  function openEditZone(zone: FeeZone) {
    clearMessages()
    setEditingZone(zone)
    setZoneForm({
      zoneType: zone.zoneType,
      minValue: Number(toNumber(zone.minValue)),
      maxValue: Number(toNumber(zone.maxValue)),
      fee: Number(toNumber(zone.fee)),
      label: zone.label ?? '',
      active: zone.active,
    })
  }

  function handleDeleteRule(id: number) {
    if (!window.confirm('Tem certeza que deseja excluir esta regra?')) return
    deleteRuleMutation.mutate(id)
  }

  function handleDeleteZone(id: number) {
    if (!window.confirm('Tem certeza que deseja excluir esta zona?')) return
    deleteZoneMutation.mutate(id)
  }

  if (isLoading) return <p className="text-gray-400 text-center py-16">Carregando...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Regras de Taxa de Entrega
        </h2>
        <button
          onClick={openNewRule}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova regra
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {saved && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Salvo com sucesso
        </div>
      )}

      {showRuleForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {editingRule ? 'Editar regra' : 'Nova regra'}
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Modo</label>
              <select
                value={ruleForm.mode}
                onChange={(e) => setRuleForm((p) => ({ ...p, mode: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Taxa base (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ruleForm.baseFee}
                onChange={(e) => setRuleForm((p) => ({ ...p, baseFee: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Taxa por km (R$/km)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ruleForm.perKmRate}
                onChange={(e) => setRuleForm((p) => ({ ...p, perKmRate: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Taxa por min (R$/min)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ruleForm.perMinRate}
                onChange={(e) => setRuleForm((p) => ({ ...p, perMinRate: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grátis acima de (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ruleForm.freeAbove}
                onChange={(e) => setRuleForm((p) => ({ ...p, freeAbove: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Raio máximo (km)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={ruleForm.maxRadiusKm}
                onChange={(e) => setRuleForm((p) => ({ ...p, maxRadiusKm: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={ruleForm.active}
                onChange={(e) => setRuleForm((p) => ({ ...p, active: e.target.checked }))}
                className="rounded"
              />
              Ativa
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRuleForm(false); setEditingRule(null) }}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (editingRule) {
                    updateRuleMutation.mutate({ id: editingRule.id, data: ruleForm })
                  } else {
                    createRuleMutation.mutate(ruleForm)
                  }
                }}
                disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                className="px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {createRuleMutation.isPending || updateRuleMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhuma regra configurada</p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const isExpanded = expandedRuleId === rule.id
            const ruleZones: FeeZone[] = (zones as Record<number, FeeZone[]>)[rule.id] ?? []

            return (
              <div key={rule.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {MODE_LABELS[rule.mode] ?? rule.mode}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                          rule.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {rule.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-[11px] text-gray-500">
                        <span>Base: R$ {toNumber(rule.baseFee)}</span>
                        <span>R$ {toNumber(rule.perKmRate)}/km</span>
                        <span>Grátis acima de R$ {toNumber(rule.freeAbove)}</span>
                        <span>Raio máx: {toNumber(rule.maxRadiusKm)} km</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleRuleActiveMutation.mutate({ id: rule.id, active: !rule.active })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${rule.active ? 'bg-brand-600' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rule.active ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <button
                      onClick={() => openEditRule(rule)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-gray-100"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Zonas</h4>
                      <button
                        onClick={() => openNewZone(rule.id)}
                        className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar zona
                      </button>
                    </div>

                    {(showZoneForm === rule.id || editingZone) && (
                      <div className="mb-3 p-3 bg-white rounded-lg border border-gray-200">
                        <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          {editingZone ? 'Editar zona' : 'Nova zona'}
                        </h5>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Tipo</label>
                            <select
                              value={zoneForm.zoneType}
                              onChange={(e) => setZoneForm((p) => ({ ...p, zoneType: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                              {ZONE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Taxa (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={zoneForm.fee}
                              onChange={(e) => setZoneForm((p) => ({ ...p, fee: Number(e.target.value) }))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Valor mínimo</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={zoneForm.minValue}
                              onChange={(e) => setZoneForm((p) => ({ ...p, minValue: Number(e.target.value) }))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Valor máximo</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={zoneForm.maxValue}
                              onChange={(e) => setZoneForm((p) => ({ ...p, maxValue: Number(e.target.value) }))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Nome (opcional)</label>
                            <input
                              type="text"
                              value={zoneForm.label}
                              onChange={(e) => setZoneForm((p) => ({ ...p, label: e.target.value }))}
                              placeholder="Ex: Zona 1 - até 3 km"
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={zoneForm.active}
                              onChange={(e) => setZoneForm((p) => ({ ...p, active: e.target.checked }))}
                              className="rounded"
                            />
                            Ativa
                          </label>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => { setShowZoneForm(null); setEditingZone(null); setZoneForm(EMPTY_ZONE) }}
                              className="px-2.5 py-1 text-[11px] text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => {
                                if (editingZone) {
                                  updateZoneMutation.mutate({ id: editingZone.id, data: zoneForm })
                                } else {
                                  createZoneMutation.mutate({ ruleId: rule.id, data: zoneForm })
                                }
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {ruleZones.length === 0 ? (
                      <p className="text-[11px] text-gray-400 py-2">Nenhuma zona configurada</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ruleZones.map((zone) => (
                          <div key={zone.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white border border-gray-100">
                            <div>
                              <span className="text-xs font-medium text-gray-700">
                                {zone.label || `${zone.zoneType === 'km' ? 'Km' : 'Min'} ${toNumber(zone.minValue)} - ${toNumber(zone.maxValue)}`}
                              </span>
                              <span className="ml-2 text-[11px] text-gray-500">
                                R$ {toNumber(zone.fee)}
                              </span>
                              <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                                zone.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                              }`}>
                                {zone.active ? 'Ativa' : 'Inativa'}
                              </span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => openEditZone(zone)}
                                className="p-1 text-gray-400 hover:text-brand-600 rounded"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteZone(zone.id)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
