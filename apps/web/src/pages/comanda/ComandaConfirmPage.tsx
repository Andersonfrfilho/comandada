import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface ComandaInfo {
  tableNumber: number
  tableCapacity: number
  code: string
  confirmed: boolean
  customerName: string | null
}

interface ConfirmResponse {
  tableNumber: number
  code: string
  customerName: string
  confirmed: true
}

export function ComandaConfirmPage() {
  const { code } = useParams<{ code: string }>()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [document, setDocument] = useState('')
  const [done, setDone] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['comanda-public', code],
    queryFn: () => api.get<ComandaInfo>(`/public/comanda/${code}`),
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: (body: { customerName: string; customerPhone: string; customerDocument?: string }) =>
      api.post<ConfirmResponse>(`/public/comanda/${code}/confirm`, body),
    onSuccess: () => setDone(true),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return
    mutation.mutate({
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerDocument: document.trim() || undefined,
    })
  }

  if (isLoading) {
    return (
      <PageShell>
        <div className="text-center py-12 text-gray-400">Verificando comanda...</div>
      </PageShell>
    )
  }

  if (isError || !data) {
    return (
      <PageShell>
        <div className="text-center py-12">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Comanda não encontrada</h2>
          <p className="text-gray-500 text-sm">Este código não existe ou a comanda já foi encerrada.</p>
        </div>
      </PageShell>
    )
  }

  if (done || data.confirmed) {
    return (
      <PageShell>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Dados confirmados!</h2>
          <p className="text-gray-500 text-sm mb-6">
            {data.confirmed && data.customerName
              ? `Bem-vindo, ${data.customerName}!`
              : 'Seus dados foram registrados com sucesso.'}
          </p>
          <div className="bg-gray-50 rounded-xl p-4 inline-block">
            <p className="text-xs text-gray-400 mb-1">Mesa</p>
            <p className="text-4xl font-bold text-gray-900">{data.tableNumber}</p>
            <p className="text-xs font-mono text-gray-400 mt-1">Comanda {data.code}</p>
          </div>
          <p className="text-sm text-gray-400 mt-6">
            Aguarde o atendimento ou faça seu pedido com o garçom.
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center text-xl font-bold">
            {data.tableNumber}
          </div>
          <div>
            <p className="font-semibold text-gray-900">Mesa {data.tableNumber}</p>
            <p className="text-sm text-gray-400 font-mono">Comanda {data.code}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Para registrar seu pedido, confirme seus dados abaixo. Suas informações ficam protegidas e são usadas apenas para identificar seu atendimento.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            required
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp *</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            required
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CPF <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input
            type="text"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            placeholder="000.000.000-00"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
            {mutation.error instanceof Error ? mutation.error.message : 'Erro ao confirmar dados. Tente novamente.'}
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending || !name.trim() || !phone.trim()}
          className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {mutation.isPending ? 'Confirmando...' : 'Confirmar dados'}
        </button>
      </form>

      <p className="text-xs text-gray-400 text-center mt-6">
        Seus dados são usados apenas para identificar este atendimento e não serão compartilhados.
      </p>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="font-bold text-gray-900">Comanda Digital</span>
        </div>
        {children}
      </div>
    </div>
  )
}
