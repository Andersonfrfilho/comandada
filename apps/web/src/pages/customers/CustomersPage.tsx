import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_CHANNEL_LABELS, type OrderStatus } from '@/constants/orderLabels'
import { Modal } from '@/components/ui/Modal'
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton'
import { Plus, Pencil, Trash2, MessageSquare, Star, MapPin } from 'lucide-react'
import { AddressForm, type AddressFormData, AddressCard } from './components/AddressForm'

interface Customer {
  id: string
  name: string
  whatsappNumber: string
  phone: string | null
  document: string | null
  birthDate: string | null
  rating: number | null
  createdAt: string
}

interface CustomerWithStats extends Customer {
  orderCount: number
  totalSpent: string
  lastOrderAt: string | null
}

interface CustomersResponse {
  data: CustomerWithStats[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface CustomerDetails {
  customer: Customer
  stats: {
    orderCount: number
    totalSpent: string
    lastOrderAt: string | null
    firstOrderAt: string | null
  }
  recentOrders: Array<{
    id: string
    status: OrderStatus
    totalAmount: string
    channel: string
    type: string
    receivedAt: string
  }>
}

interface AddressItem {
  id: string
  customerId: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  zip: string | null
  label: string | null
  lat: number | null
  lng: number | null
  isDefault: boolean
  createdAt: string
}


function formatWhatsApp(number: string) {
  const n = number.replace(/\D/g, '')
  if (n.length === 13) return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`
  return number
}

function formatPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length <= 2) return `+${digits}`
  if (digits.length <= 4) return `+${digits.slice(0, 2)} (${digits.slice(2)}`
  if (digits.length <= 9) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4)}`
  if (digits.length <= 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`
}

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatBRL(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function calcAge(birthDate: string): number {
  const today = new Date()
  const dob = new Date(birthDate + 'T00:00:00')
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

function isAdult(birthDate: string): boolean {
  return calcAge(birthDate) >= 18
}

function formatDocument(doc: string) {
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

interface CustomerFormData {
  name: string
  whatsappNumber: string
  document: string
  birthDate: string
  rating: number | null
}

const emptyForm: CustomerFormData = { name: '', whatsappNumber: '', document: '', birthDate: '', rating: null }

type CustomerSortField = 'name' | 'orderCount' | 'totalSpent' | 'createdAt'
type SortDirection = 'asc' | 'desc'

export function CustomersPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<CustomerFormData>(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<CustomerSortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageSize = 20
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<AddressFormData | null>(null)
  const [addressDeleteId, setAddressDeleteId] = useState<string | null>(null)

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  function handleSort(field: CustomerSortField) {
    if (field === sortBy) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortDirection('asc')
  }

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, debouncedSearch, sortBy, sortDirection],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDirection,
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      return api.get<CustomersResponse>(`/customers?${params}`, accessToken ?? undefined)
    },
  })

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['customer-details', selectedId],
    queryFn: () => api.get<CustomerDetails>(`/customers/${selectedId}`, accessToken ?? undefined),
    enabled: !!selectedId,
  })

  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: ['customer-addresses', selectedId],
    queryFn: () => api.get<AddressItem[]>(`/customers/${selectedId}/addresses`, accessToken ?? undefined),
    enabled: !!selectedId,
  })

  function openCreate() {
    setForm(emptyForm)
    setFormError(null)
    setModalMode('create')
  }

  function openEdit(customer: Customer) {
    setForm({
      name: customer.name,
      whatsappNumber: customer.whatsappNumber,
      document: customer.document ?? '',
      birthDate: customer.birthDate ?? '',
      rating: customer.rating,
    })
    setFormError(null)
    setModalMode('edit')
    setSelectedId(customer.id)
  }

  async function handleSubmit() {
    setFormLoading(true)
    setFormError(null)
    try {
      const cleanWhatsApp = stripNonDigits(form.whatsappNumber)
      if (modalMode === 'create') {
        await api.post('/customers', {
          name: form.name,
          whatsappNumber: cleanWhatsApp,
          document: form.document || undefined,
          birthDate: form.birthDate || undefined,
          rating: form.rating,
        }, accessToken ?? undefined)
      } else {
        await api.put(`/customers/${selectedId}`, {
          name: form.name,
          whatsappNumber: cleanWhatsApp,
          document: form.document || null,
          birthDate: form.birthDate || null,
          rating: form.rating,
        }, accessToken ?? undefined)
      }
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      void queryClient.invalidateQueries({ queryKey: ['customer-details', selectedId] })
      setModalMode(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      setFormError(msg)
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/customers/${id}`, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      if (selectedId === id) setSelectedId(null)
    } finally {
      setDeleteConfirmId(null)
    }
  }

  function openAddAddress() {
    setEditingAddress(null)
    setAddressModalOpen(true)
  }

  function openEditAddress(address: AddressItem) {
    setEditingAddress({
      id: address.id,
      street: address.street,
      number: address.number,
      complement: address.complement ?? '',
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zip: address.zip ?? '',
      label: address.label ?? '',
      lat: address.lat,
      lng: address.lng,
      isDefault: address.isDefault,
    })
    setAddressModalOpen(true)
  }

  async function handleSaveAddress(formData: AddressFormData) {
    if (!selectedId) return
    try {
      const payload = {
        street: formData.street,
        number: formData.number,
        complement: formData.complement || undefined,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        zip: formData.zip || undefined,
        label: formData.label || undefined,
        lat: formData.lat ?? undefined,
        lng: formData.lng ?? undefined,
        geocode: !formData.lat || !formData.lng,
      }
      if (editingAddress?.id) {
        await api.put(
          `/customers/${selectedId}/addresses/${editingAddress.id}`,
          {
            ...payload,
            complement: payload.complement ?? null,
            zip: payload.zip ?? null,
            label: payload.label ?? null,
            lat: payload.lat ?? null,
            lng: payload.lng ?? null,
          },
          accessToken ?? undefined
        )
      } else {
        await api.post(`/customers/${selectedId}/addresses`, payload, accessToken ?? undefined)
      }
      void queryClient.invalidateQueries({ queryKey: ['customer-addresses', selectedId] })
      setAddressModalOpen(false)
      setEditingAddress(null)
    } catch {
      // error handled by api layer
    }
  }

  async function handleDeleteAddress(addressId: string) {
    if (!selectedId) return
    try {
      await api.delete(`/customers/${selectedId}/addresses/${addressId}`, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['customer-addresses', selectedId] })
    } finally {
      setAddressDeleteId(null)
    }
  }

  async function handleSetDefaultAddress(addressId: string) {
    if (!selectedId) return
    try {
      await api.put(`/customers/${selectedId}/addresses/${addressId}/default`, {}, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['customer-addresses', selectedId] })
    } catch {
      // error handled by api layer
    }
  }

  return (
    <div className="p-4 md:p-6 flex gap-6">
      {/* Lista principal */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Clientes</h1>
            <p className="text-gray-500 text-sm mt-1">
              {data?.total ?? 0} cliente{(data?.total ?? 0) !== 1 ? 's' : ''} cadastrado{(data?.total ?? 0) !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Buscar por nome ou WhatsApp..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Novo
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <SortableHeader field="name" label="Cliente" align="left" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Contato</th>
                  <SortableHeader field="orderCount" label="Pedidos" align="right" className="hidden md:table-cell" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="totalSpent" label="Total gasto" align="right" className="hidden md:table-cell" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="createdAt" label="Desde" align="left" className="hidden lg:table-cell" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-6"><SkeletonList rows={4} rowClassName="h-12 w-full" /></td></tr>
                ) : data?.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      {debouncedSearch ? 'Nenhum cliente encontrado para esta busca' : 'Nenhum cliente cadastrado'}
                    </td>
                  </tr>
                ) : (
                  data?.data.map((customer, index) => (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedId(customer.id === selectedId ? null : customer.id)}
                      className={`hover:bg-gray-100 transition-colors cursor-pointer ${
                        selectedId === customer.id
                          ? 'bg-brand-50 border-l-2 border-l-brand-500'
                          : index % 2 === 1
                            ? 'bg-gray-50'
                            : 'bg-white'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-gray-900 truncate">{customer.name}</p>
                              {customer.rating != null && <StarDisplay rating={customer.rating} size="sm" />}
                            </div>
                            {customer.document && (
                              <p className="text-xs text-gray-400 font-mono">{formatDocument(customer.document)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-gray-600 font-mono text-sm">{formatWhatsApp(customer.whatsappNumber)}</p>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {customer.orderCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 hidden md:table-cell">
                        {formatBRL(customer.totalSpent)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm hidden lg:table-cell">
                        {formatDate(customer.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">Página {data.page} de {data.totalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Painel de detalhes — desktop */}
      {selectedId && (
        <div className="w-80 flex-shrink-0 hidden lg:block">
          <CustomerDetailPanel
            details={details ?? null}
            isLoading={detailsLoading}
            addresses={addresses ?? null}
            addressesLoading={addressesLoading}
            onClose={() => setSelectedId(null)}
            onEdit={openEdit}
            onDelete={(id) => setDeleteConfirmId(id)}
            onAddAddress={openAddAddress}
            onEditAddress={openEditAddress}
            onDeleteAddress={(id) => setAddressDeleteId(id)}
            onSetDefaultAddress={handleSetDefaultAddress}
          />
        </div>
      )}

      {/* Drawer mobile */}
      {selectedId && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedId(null)} />
          <div className="w-80 bg-white h-full overflow-y-auto shadow-xl">
            <CustomerDetailPanel
              details={details ?? null}
              isLoading={detailsLoading}
              addresses={addresses ?? null}
              addressesLoading={addressesLoading}
              onClose={() => setSelectedId(null)}
              onEdit={openEdit}
              onDelete={(id) => setDeleteConfirmId(id)}
              onAddAddress={openAddAddress}
              onEditAddress={openEditAddress}
              onDeleteAddress={(id) => setAddressDeleteId(id)}
              onSetDefaultAddress={handleSetDefaultAddress}
            />
          </div>
        </div>
      )}

      <Modal open={modalMode !== null} onClose={() => setModalMode(null)} title={modalMode === 'create' ? 'Novo cliente' : 'Editar cliente'}>
            <div className="p-5 space-y-4">
              <Field label="Nome *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nome completo" />
              <WhatsAppField
                label={modalMode === 'create' ? 'WhatsApp *' : 'WhatsApp'}
                value={form.whatsappNumber}
                onChange={(v) => setForm((f) => ({ ...f, whatsappNumber: stripNonDigits(v) }))}
                placeholder="+55 (11) 98888-7777"
              />
              <Field label="CPF / CNPJ" value={form.document} onChange={(v) => setForm((f) => ({ ...f, document: v }))} placeholder="000.000.000-00" />
              <Field label="Data de nascimento" value={form.birthDate} onChange={(v) => setForm((f) => ({ ...f, birthDate: v }))} type="date" />
              <StarRatingInput
                value={form.rating}
                onChange={(v) => setForm((f) => ({ ...f, rating: v }))}
                label="Avaliação"
              />
              {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setModalMode(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={formLoading || !form.name || (modalMode === 'create' && !form.whatsappNumber)}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-95"
              >
                {formLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
      </Modal>

      <Modal open={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} size="sm">
            <div className="p-6">
              <h2 className="font-semibold text-gray-900 mb-2">Excluir cliente?</h2>
              <p className="text-sm text-gray-500 mb-5">Esta ação não pode ser desfeita. O histórico de pedidos permanece.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={() => deleteConfirmId && void handleDelete(deleteConfirmId)}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors active:scale-95"
                >
                  Excluir
                </button>
              </div>
            </div>
      </Modal>

      <Modal open={addressModalOpen} onClose={() => { setAddressModalOpen(false); setEditingAddress(null) }} size="md" title={editingAddress ? 'Editar endereço' : 'Novo endereço'} key={editingAddress?.id ?? 'new'}>
            <div className="p-5">
              <AddressForm
                initialValues={editingAddress ?? undefined}
                onSave={handleSaveAddress}
                onCancel={() => { setAddressModalOpen(false); setEditingAddress(null) }}
              />
            </div>
      </Modal>

      <Modal open={addressDeleteId !== null} onClose={() => setAddressDeleteId(null)} size="sm">
            <div className="p-6">
              <h2 className="font-semibold text-gray-900 mb-2">Excluir endereço?</h2>
              <p className="text-sm text-gray-500 mb-5">Esta ação não pode ser desfeita.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setAddressDeleteId(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={() => addressDeleteId && void handleDeleteAddress(addressDeleteId)}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors active:scale-95"
                >
                  Excluir
                </button>
              </div>
            </div>
      </Modal>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    </div>
  )
}

function WhatsAppField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (raw: string) => void; placeholder?: string
}) {
  const displayValue = formatPhoneMask(value)

  function handleChange(rawInput: string) {
    onChange(stripNonDigits(rawInput))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="tel"
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    </div>
  )
}

function CustomerDetailPanel({
  details,
  isLoading,
  addresses,
  addressesLoading,
  onClose,
  onEdit,
  onDelete,
  onAddAddress,
  onEditAddress,
  onDeleteAddress,
  onSetDefaultAddress,
}: {
  details: CustomerDetails | null
  isLoading: boolean
  addresses: AddressItem[] | null
  addressesLoading: boolean
  onClose: () => void
  onEdit: (customer: Customer) => void
  onDelete: (id: string) => void
  onAddAddress: () => void
  onEditAddress: (address: AddressItem) => void
  onDeleteAddress: (id: string) => void
  onSetDefaultAddress: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-fit sticky top-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Detalhes</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">×</button>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <SkeletonList rows={3} rowClassName="h-8 w-full" />
        </div>
      ) : !details ? null : (
        <div className="p-4 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
              {details.customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{details.customer.name}</p>
              <p className="text-sm text-gray-500 font-mono">{formatWhatsApp(details.customer.whatsappNumber)}</p>
              {details.customer.rating != null && (
                <div className="mt-1">
                  <StarDisplay rating={details.customer.rating} size="md" />
                </div>
              )}
              {details.customer.document && (
                <p className="text-xs text-gray-400 font-mono">{formatDocument(details.customer.document)}</p>
              )}
              {details.customer.birthDate && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs text-gray-400">
                    {formatDate(details.customer.birthDate)} · {calcAge(details.customer.birthDate)} anos
                  </p>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                    isAdult(details.customer.birthDate)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {isAdult(details.customer.birthDate) ? '18+' : 'Menor'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onEdit(details.customer)}
              className="flex items-center justify-center gap-1 flex-1 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              onClick={() => onDelete(details.customer.id)}
              className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Pedidos" value={String(details.stats.orderCount)} />
            <StatCard label="Total gasto" value={formatBRL(details.stats.totalSpent)} small />
            <StatCard label="Primeiro pedido" value={details.stats.firstOrderAt ? formatDate(details.stats.firstOrderAt) : '—'} small />
            <StatCard label="Último pedido" value={details.stats.lastOrderAt ? formatDate(details.stats.lastOrderAt) : '—'} small />
          </div>

          <p className="text-xs text-gray-400">
            Cliente desde {new Date(details.customer.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>

          {/* Addresses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Endereços</h3>
              <button
                onClick={onAddAddress}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo
              </button>
            </div>
            {addressesLoading ? (
              <SkeletonList rows={2} rowClassName="h-16 w-full" />
            ) : !addresses || addresses.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum endereço cadastrado</p>
            ) : (
              <div className="space-y-2">
                {addresses.map((addr) => (
                  <AddressCard
                    key={addr.id}
                    address={{
                      id: addr.id,
                      street: addr.street,
                      number: addr.number,
                      complement: addr.complement ?? '',
                      neighborhood: addr.neighborhood,
                      city: addr.city,
                      state: addr.state,
                      zip: addr.zip ?? '',
                      label: addr.label ?? '',
                      lat: addr.lat,
                      lng: addr.lng,
                      isDefault: addr.isDefault,
                    }}
                    onEdit={(data) => {
                      const full = addresses.find((a) => a.id === data.id)!
                      onEditAddress(full)
                    }}
                    onDelete={onDeleteAddress}
                    onSetDefault={onSetDefaultAddress}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Últimos pedidos</h3>
            {details.recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum pedido ainda</p>
            ) : (
              <div className="space-y-2">
                {details.recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                        <span className="text-xs text-gray-400">{ORDER_CHANNEL_LABELS[order.channel] ?? order.channel}</span>
                      </div>
                      <p className="text-xs text-gray-400">{formatDateTime(order.receivedAt)}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatBRL(order.totalAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`font-semibold text-gray-900 ${small ? 'text-sm' : 'text-lg'}`}>{value}</p>
    </div>
  )
}

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const starSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${starSize} ${
            star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
          }`}
        />
      ))}
    </span>
  )
}

function StarRatingInput({
  value,
  onChange,
  label,
}: {
  value: number | null
  onChange: (v: number | null) => void
  label: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const displayValue = hover ?? value ?? 0
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(value === star ? null : star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(null)}
            className="transition-colors"
          >
            <Star
              className={`h-6 w-6 ${
                star <= displayValue
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            limpar
          </button>
        )}
      </div>
    </div>
  )
}

interface SortableHeaderProps {
  field: CustomerSortField
  label: string
  align: 'left' | 'right'
  sortBy: CustomerSortField
  sortDirection: SortDirection
  onSort: (field: CustomerSortField) => void
  className?: string
}

function SortableHeader({ field, label, align, sortBy, sortDirection, onSort, className }: SortableHeaderProps) {
  const isActive = sortBy === field
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${align === 'right' ? 'text-right' : 'text-left'} ${className ?? ''}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-gray-700 transition-colors ${isActive ? 'text-gray-900' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <span className="text-[10px] leading-none">
          {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  )
}
