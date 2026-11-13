import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Receipt, FileDown, Printer, Trash2, RefreshCw, X } from 'lucide-react'
import { API_URL } from '@/lib/apiEndpoints'


type FiscalDocStatus = 'pending' | 'emitting' | 'authorized' | 'rejected' | 'cancelled'

interface FiscalDoc {
  id: string
  orderId: string
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

const STATUS_LABELS: Record<FiscalDocStatus, string> = {
  pending: 'Pendente',
  emitting: 'Emitindo',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
}

const STATUS_BADGE: Record<FiscalDocStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  emitting: 'bg-blue-100 text-blue-700 animate-pulse',
  authorized: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500',
}

const FILTERABLE_STATUSES: FiscalDocStatus[] = [
  'pending',
  'emitting',
  'authorized',
  'rejected',
  'cancelled',
]

function formatCurrency(value: string | null): string {
  return `R$ ${Number(value ?? 0).toFixed(2)}`
}

export function FiscalDocumentsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<Set<FiscalDocStatus>>(new Set())
  const [search, setSearch] = useState('')

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['fiscal-documents'],
    queryFn: () => api.get<FiscalDoc[]>('/fiscal-documents', accessToken ?? undefined),
  })

  useWebSocket((message) => {
    if (message.type.startsWith('fiscal:')) {
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] })
    }
  })

  const retryMutation = useMutation({
    mutationFn: (documentId: string) =>
      api.post(`/fiscal-documents/${documentId}/retry`, {}, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] }),
    onError: () => window.alert('Falha ao reprocessar a nota. Tente novamente.'),
  })

  const cancelMutation = useMutation({
    mutationFn: (params: { documentId: string; justificativa: string }) =>
      api.post(
        `/fiscal-documents/${params.documentId}/cancel`,
        { justificativa: params.justificativa },
        accessToken ?? undefined
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] }),
    onError: () => window.alert('Falha ao cancelar a nota. Tente novamente.'),
  })

  const printMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/orders/${orderId}/fiscal-document/print`, {}, accessToken ?? undefined),
    onError: () => window.alert('Não foi possível imprimir. Verifique a impressora.'),
  })

  async function handleDownloadXml(documentId: string) {
    const response = await fetch(`${API_URL}/fiscal-documents/${documentId}/xml`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
    if (!response.ok) {
      window.alert('Não foi possível baixar o XML.')
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
      window.alert('Não foi possível gerar o PDF.')
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

  const hasActiveFilter = statusFilter.size > 0 || search.trim().length > 0

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase()
    return documents.filter((doc) => {
      if (statusFilter.size > 0 && !statusFilter.has(doc.status)) return false
      if (term.length === 0) return true
      const chave = doc.chaveAcesso?.toLowerCase() ?? ''
      const numero = String(doc.numeroDocumento ?? '')
      const orderId = doc.orderId.toLowerCase()
      return chave.includes(term) || numero.includes(term) || orderId.includes(term)
    })
  }, [documents, statusFilter, search])

  function handleToggleStatus(status: FiscalDocStatus) {
    setStatusFilter((current) => {
      const next = new Set(current)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  function handleClearFilters() {
    setStatusFilter(new Set())
    setSearch('')
  }

  function handleCancel(documentId: string) {
    const justificativa = window.prompt('Justificativa do cancelamento (mínimo 15 caracteres):')
    if (!justificativa || justificativa.trim().length < 15) return
    cancelMutation.mutate({ documentId, justificativa: justificativa.trim() })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center gap-3">
        <Receipt className="h-8 w-8 text-brand-500" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notas Fiscais</h1>
          <p className="text-sm text-gray-500">
            {documents.length} {documents.length === 1 ? 'nota emitida' : 'notas emitidas'}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERABLE_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => handleToggleStatus(status)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                statusFilter.has(status)
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
              Limpar filtros
            </button>
          )}
        </div>
        <input
          type="search"
          aria-label="Buscar nota fiscal por chave ou número"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por chave ou número..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:w-64"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : filteredDocuments.length === 0 ? (
        <p className="text-gray-500">Nenhuma nota fiscal emitida ainda</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Nº / Série</th>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => (
                <tr key={doc.id} className="border-t border-gray-100 odd:bg-white even:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {doc.numeroDocumento ? `${doc.numeroDocumento} / ${doc.serie ?? '-'}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{doc.orderId.slice(0, 8)}</td>
                  <td className="px-4 py-3 uppercase text-gray-600">{doc.model}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_BADGE[doc.status]}`}
                      title={doc.status === 'rejected' ? doc.errorMessage ?? undefined : undefined}
                    >
                      {STATUS_LABELS[doc.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900">{formatCurrency(doc.totalLiquido)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(doc.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
