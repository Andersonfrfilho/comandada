import { toast } from '@/stores/toastStore'
import { confirmDialog } from '@/stores/confirmStore'
import { FISCAL_STATUS_COLORS, FISCAL_STATUS_LABELS } from '@/constants/statusLabels'
import { orderNumberLabel } from '@/lib/orderLabel'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Receipt, FileDown, Printer, Trash2, RefreshCw, X } from 'lucide-react'
import { API_URL } from '@/lib/apiEndpoints'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { FilterBar, FilterField, FilterSelect, SearchField } from '@/components/ui/ListFilters'
import { useListParams } from '@/hooks/useListParams'
import { formatBRL, formatDateTime, plural } from '@/lib/listing'


type FiscalDocStatus = 'pending' | 'emitting' | 'authorized' | 'rejected' | 'cancelled'

interface FiscalDoc {
  id: string
  orderId: string
  order?: { number: number | null; code: string | null } | null
  model: string
  status: FiscalDocStatus
  numeroDocumento: number | null
  serie: string | null
  chaveAcesso: string | null
  totalLiquido: string | null
  errorCode: string | null
  errorMessage: string | null
  danfePdfUrl: string | null
  xmlAutorizado: string | null
  authorizedAt: string | null
  createdAt: string
}



const FILTERABLE_STATUSES: FiscalDocStatus[] = [
  'pending',
  'emitting',
  'authorized',
  'rejected',
  'cancelled',
]

interface FiscalDocsPage {
  data: FiscalDoc[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const FISCAL_SORT_FIELDS = ['createdAt', 'totalLiquido', 'numeroDocumento'] as const
type FiscalSortField = (typeof FISCAL_SORT_FIELDS)[number]

type FiscalModel = 'nfce' | 'nfe' | 'sat'

const FISCAL_MODEL_LABELS: Record<string, string> = { nfce: 'NFC-e', nfe: 'NF-e', sat: 'SAT' }
const MODEL_OPTIONS: ReadonlyArray<{ value: FiscalModel; label: string }> = [
  { value: 'nfce', label: 'NFC-e' },
  { value: 'nfe', label: 'NF-e' },
  { value: 'sat', label: 'SAT' },
]

function parseStatusList(value: string): FiscalDocStatus[] {
  return value.split(',').filter((item): item is FiscalDocStatus => FILTERABLE_STATUSES.some((status) => status === item))
}

export function FiscalDocumentsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const list = useListParams<FiscalSortField>({
    sortFields: FISCAL_SORT_FIELDS,
    defaultSort: { field: 'createdAt', direction: 'desc' },
  })
  const statusFilter = parseStatusList(list.filter('status'))
  const modelParam = list.filter('model')
  const modelFilter: FiscalModel | '' = MODEL_OPTIONS.some((option) => option.value === modelParam) ? (modelParam as FiscalModel) : ''
  const dateFrom = list.filter('dateFrom')
  const dateTo = list.filter('dateTo')
  const hasActiveFilter = statusFilter.length > 0 || !!modelFilter || !!dateFrom || !!dateTo || !!list.search

  const fiscalQueryParams = new URLSearchParams({
    page: String(list.page),
    pageSize: String(list.pageSize),
    sortBy: list.sort.field,
    sortDirection: list.sort.direction,
  })
  if (statusFilter.length) fiscalQueryParams.set('status', statusFilter.join(','))
  if (modelFilter) fiscalQueryParams.set('model', modelFilter)
  if (dateFrom) fiscalQueryParams.set('dateFrom', dateFrom)
  if (dateTo) fiscalQueryParams.set('dateTo', dateTo)
  if (list.search) fiscalQueryParams.set('search', list.search)

  const { data, isLoading } = useQuery({
    queryKey: ['fiscal-documents', fiscalQueryParams.toString()],
    queryFn: () => api.get<FiscalDocsPage>(`/fiscal-documents?${fiscalQueryParams.toString()}`, accessToken ?? undefined),
    placeholderData: (previous) => previous,
  })
  const documents = data?.data ?? []
  const total = data?.total ?? 0

  useWebSocket((message) => {
    if (message.type.startsWith('fiscal:')) {
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] })
    }
  })

  const retryMutation = useMutation({
    mutationFn: (documentId: string) =>
      api.post(`/fiscal-documents/${documentId}/retry`, {}, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] }),
    onError: () => toast.error('Não deu para reprocessar a nota. Tente de novo.'),
  })

  const cancelMutation = useMutation({
    mutationFn: (params: { documentId: string; justificativa: string }) =>
      api.post(
        `/fiscal-documents/${params.documentId}/cancel`,
        { justificativa: params.justificativa },
        accessToken ?? undefined
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] }),
    onError: (error: Error) => toast.error(error.message || 'Não deu para cancelar a nota. Tente de novo.'),
  })

  const printMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/orders/${orderId}/fiscal-document/print`, {}, accessToken ?? undefined),
    onError: () => toast.error('Não foi possível imprimir. Verifique a impressora.'),
  })

  async function handleDownloadXml(documentId: string) {
    const response = await fetch(`${API_URL}/fiscal-documents/${documentId}/xml`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
    if (!response.ok) {
      toast.error('Não foi possível baixar o XML.')
      return
    }
    const data = (await response.json()) as { xml: string }
    const blob = new Blob([data.xml], { type: 'application/xml' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `nota-${documentId}.xml`
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  async function handleDownloadPdf(documentId: string) {
    const response = await fetch(`${API_URL}/fiscal-documents/${documentId}/pdf`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
    if (!response.ok) {
      toast.error('Não foi possível gerar o PDF.')
      return
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `danfe-${documentId}.pdf`
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  function handleToggleStatus(status: FiscalDocStatus) {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((current) => current !== status)
      : [...statusFilter, status]
    list.setFilter('status', next.join(',') || null)
  }

  async function handleCancel(documentId: string) {
    // Antes um prompt do navegador: texto curto sumia sem aviso.
    const justificativa = await confirmDialog({
      title: 'Cancelar nota fiscal?',
      message: 'O cancelamento vai para a Receita e não pode ser desfeito.',
      confirmLabel: 'Cancelar nota',
      cancelLabel: 'Voltar',
      tone: 'danger',
      input: { label: 'Justificativa', minLength: 15, placeholder: 'Ex.: pedido cancelado pelo cliente antes do preparo' },
    })
    if (!justificativa) return
    cancelMutation.mutate({ documentId, justificativa })
  }

  function renderActions(doc: FiscalDoc) {
    return (
      <div className="flex flex-wrap gap-2">
        {doc.status === 'authorized' && (
          <>
            {doc.danfePdfUrl ? (
              <a
                href={doc.danfePdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <FileDown className="h-4 w-4" />
                PDF
              </a>
            ) : doc.xmlAutorizado ? (
              <button
                type="button"
                onClick={() => handleDownloadPdf(doc.id)}
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <FileDown className="h-4 w-4" />
                PDF
              </button>
            ) : (
              <span className="flex items-center gap-1 text-gray-300" title="PDF não disponível para este documento">
                <FileDown className="h-4 w-4" />
                PDF
              </span>
            )}
            <button
              type="button"
              onClick={() => handleDownloadXml(doc.id)}
              className="flex items-center gap-1 text-blue-600 hover:underline"
            >
              <FileDown className="h-4 w-4" />
              XML
            </button>
            <button
              type="button"
              onClick={() => printMutation.mutate(doc.orderId)}
              disabled={printMutation.isPending}
              className="flex items-center gap-1 text-gray-600 hover:underline disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={() => handleCancel(doc.id)}
              disabled={cancelMutation.isPending}
              className="flex items-center gap-1 text-red-600 hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Cancelar
            </button>
          </>
        )}
        {doc.status === 'rejected' && (
          <button
            type="button"
            onClick={() => retryMutation.mutate(doc.id)}
            disabled={retryMutation.isPending}
            className="flex items-center gap-1 text-amber-600 hover:underline disabled:opacity-50"
            title={doc.errorMessage ?? undefined}
          >
            <RefreshCw className="h-4 w-4" />
            Reprocessar
          </button>
        )}
        {(doc.status === 'pending' || doc.status === 'emitting') && (
          <span className="flex items-center gap-1 text-blue-600">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
            Emitindo...
          </span>
        )}
      </div>
    )
  }

  const columns: ReadonlyArray<DataTableColumn<FiscalDoc, FiscalSortField>> = [
    {
      key: 'numero',
      header: 'Nº / Série',
      sortField: 'numeroDocumento',
      defaultDirection: 'desc',
      render: (doc) => (
        <span className="font-medium text-gray-900 whitespace-nowrap">
          {doc.numeroDocumento ? `${doc.numeroDocumento} / ${doc.serie ?? '-'}` : '—'}
        </span>
      ),
    },
    {
      key: 'order',
      header: 'Pedido',
      className: 'hidden sm:table-cell',
      render: (doc) => (
        <span className="font-semibold text-gray-800">
          {orderNumberLabel({ id: doc.orderId, number: doc.order?.number ?? null, code: doc.order?.code ?? null })}
        </span>
      ),
    },
    {
      key: 'model',
      header: 'Modelo',
      className: 'hidden md:table-cell',
      render: (doc) => <span className="text-gray-600">{FISCAL_MODEL_LABELS[doc.model] ?? doc.model}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (doc) => (
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${FISCAL_STATUS_COLORS[doc.status]}`}
          title={doc.status === 'rejected' ? doc.errorMessage ?? undefined : undefined}
        >
          {FISCAL_STATUS_LABELS[doc.status]}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Valor',
      align: 'right',
      sortField: 'totalLiquido',
      defaultDirection: 'desc',
      render: (doc) => <span className="text-gray-900 whitespace-nowrap">{formatBRL(doc.totalLiquido)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Data',
      sortField: 'createdAt',
      defaultDirection: 'desc',
      className: 'hidden lg:table-cell',
      render: (doc) => <span className="text-gray-600 whitespace-nowrap">{formatDateTime(doc.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Ações',
      render: renderActions,
    },
  ]

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center gap-3">
        <Receipt className="h-8 w-8 text-brand-500" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notas Fiscais</h1>
          <p className="text-sm text-gray-500">
            {hasActiveFilter ? plural(total, 'nota encontrada', 'notas encontradas') : plural(total, 'nota emitida', 'notas emitidas')}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        {FILTERABLE_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => handleToggleStatus(status)}
            aria-pressed={statusFilter.includes(status)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              statusFilter.includes(status) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {FISCAL_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <FilterBar hasActiveFilters={hasActiveFilter} onClear={list.clearAll}>
        <SearchField value={list.searchInput} onChange={list.setSearchInput} placeholder="Chave, número ou pedido" />
        <FilterField label="Modelo" className="w-full sm:w-36">
          <FilterSelect
            value={modelFilter}
            onChange={(value) => list.setFilter('model', value || null)}
            options={MODEL_OPTIONS}
          />
        </FilterField>
        <FilterField label="De" className="w-full sm:w-auto">
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => list.setFilter('dateFrom', event.target.value || null)}
            className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </FilterField>
        <FilterField label="Até" className="w-full sm:w-auto">
          <input
            type="date"
            value={dateTo}
            onChange={(event) => list.setFilter('dateTo', event.target.value || null)}
            className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </FilterField>
      </FilterBar>

      <DataTable
        caption="Notas fiscais"
        columns={columns}
        rows={documents}
        rowKey={(doc) => doc.id}
        isLoading={isLoading}
        emptyMessage={hasActiveFilter ? 'Nenhuma nota encontrada com esses filtros' : 'Nenhuma nota fiscal emitida ainda'}
        sort={list.sort}
        onSort={list.setSort}
        minWidthClassName="min-w-[560px]"
        footer={
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={total}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        }
      />
    </div>
  )
}
