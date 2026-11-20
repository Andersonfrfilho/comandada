import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Plus, RotateCcw, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select, type SelectOption } from '@/components/ui/Select'
import { api, ApiError } from '@/lib/api'
import { formatBRL, formatDate } from '@/lib/listing'
import { useAuthStore } from '@/stores/authStore'
import { confirmDialog } from '@/stores/confirmStore'
import { toast } from '@/stores/toastStore'

/** Rotas do módulo de contas a pagar (`@adatechnology/expense-module`), montadas pela API sob este prefixo. */
const BASE = '/accounts-payable'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type ExpenseKind = 'fixed' | 'variable'
type Recurrence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly' | 'fortnightly'

const RECURRENCE_OPTIONS: SelectOption<Recurrence>[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'fortnightly', label: 'Quinzenal (dia 15 e fim do mês)' },
]

const KIND_OPTIONS: SelectOption<ExpenseKind>[] = [
  { value: 'fixed', label: 'Fixa (repete todo mês)', hint: 'Aluguel, internet, salários' },
  { value: 'variable', label: 'Avulsa (vence uma vez)', hint: 'Conserto, compra, boleto único' },
]

interface Category {
  id: string
  name: string
  active: boolean
}

interface Occurrence {
  id: string
  expenseId: string
  expenseName: string
  expenseKind: ExpenseKind
  categoryName: string
  dueDate: string
  expectedAmount: string
  paidAmount: string | null
  paidAt: string | null
  status: 'open' | 'paid' | 'canceled'
  installmentNumber: number | null
  installmentsTotal: number | null
}

interface Summary {
  total: string
  open: string
  overdue: string
  paid: string
  count: { open: number; overdue: number; paid: number; canceled: number }
}

function toCompetence(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : 'Não foi possível concluir.'
}

function situation(occurrence: Occurrence, today: string): { label: string; className: string } {
  if (occurrence.status === 'paid') return { label: 'Paga', className: 'bg-green-100 text-green-700' }
  if (occurrence.status === 'canceled') return { label: 'Cancelada', className: 'bg-gray-100 text-gray-500' }
  if (occurrence.dueDate < today) return { label: 'Vencida', className: 'bg-red-100 text-red-700' }
  if (occurrence.dueDate === today) return { label: 'Vence hoje', className: 'bg-amber-100 text-amber-700' }
  return { label: 'Em aberto', className: 'bg-blue-50 text-blue-700' }
}

const inputClass =
  'w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500'

export function AccountsPayableTab(): JSX.Element {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const queryClient = useQueryClient()
  const today = todayInSaoPaulo()

  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [monthIndex, setMonthIndex] = useState(() => Number(today.slice(5, 7)) - 1)
  const competence = toCompetence(year, monthIndex)

  const categoriesQuery = useQuery({
    queryKey: ['accounts-payable', 'categories'],
    queryFn: () => api.get<{ data: Category[] }>(`${BASE}/expense-categories`, accessToken),
    staleTime: 5 * 60_000,
  })
  const occurrencesQuery = useQuery({
    queryKey: ['accounts-payable', 'occurrences', competence],
    queryFn: () => api.get<{ data: Occurrence[] }>(`${BASE}/expense-occurrences?competence=${competence}`, accessToken),
  })
  const summaryQuery = useQuery({
    queryKey: ['accounts-payable', 'summary', competence],
    queryFn: () => api.get<{ data: Summary }>(`${BASE}/expense-summary?competence=${competence}`, accessToken),
  })

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: ['accounts-payable'] })
    void queryClient.invalidateQueries({ queryKey: ['financial-overview'] })
  }

  function shiftMonth(delta: number): void {
    const next = new Date(year, monthIndex + delta, 1)
    setYear(next.getFullYear())
    setMonthIndex(next.getMonth())
  }

  // ---------- lançar conta ----------
  const [createOpen, setCreateOpen] = useState(false)
  const [kind, setKind] = useState<ExpenseKind>('fixed')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('monthly')
  const [dueDay, setDueDay] = useState('')
  const [dueDate, setDueDate] = useState(today)
  const [installments, setInstallments] = useState('')
  const [supplier, setSupplier] = useState('')

  function openCreate(): void {
    setKind('fixed')
    setName('')
    setCategoryId(null)
    setAmount('')
    setRecurrence('monthly')
    setDueDay('')
    setDueDate(today)
    setInstallments('')
    setSupplier('')
    setCreateOpen(true)
  }

  const dueDayNumber = Number(dueDay)
  const needsDueDay = kind === 'fixed' && recurrence !== 'fortnightly'
  const canCreate =
    name.trim().length >= 2 &&
    categoryId !== null &&
    amount.trim() !== '' &&
    (kind === 'variable' ? dueDate !== '' : !needsDueDay || (Number.isInteger(dueDayNumber) && dueDayNumber >= 1 && dueDayNumber <= 31))

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(
        `${BASE}/expenses`,
        {
          kind,
          name: name.trim(),
          categoryId,
          expectedAmount: amount.trim(),
          ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
          ...(kind === 'fixed'
            ? {
                recurrence,
                ...(needsDueDay ? { dueDay: dueDayNumber } : {}),
                ...(installments.trim() ? { installmentsTotal: Number(installments) } : {}),
              }
            : { dueDate }),
        },
        accessToken,
      ),
    onSuccess: () => {
      setCreateOpen(false)
      toast.success('Conta lançada.')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  // ---------- dar baixa ----------
  const [paying, setPaying] = useState<Occurrence | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [paidAt, setPaidAt] = useState(today)

  function openPay(occurrence: Occurrence): void {
    setPaying(occurrence)
    setPaidAmount(occurrence.expectedAmount.replace('.', ','))
    setPaidAt(today)
  }

  const payMutation = useMutation({
    mutationFn: (occurrence: Occurrence) =>
      api.post(
        `${BASE}/expense-occurrences/${occurrence.id}/settlement`,
        { paidAmount: paidAmount.trim(), paidAt, via: 'panel' },
        accessToken,
      ),
    onSuccess: () => {
      setPaying(null)
      toast.success('Pagamento registrado.')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const reopenMutation = useMutation({
    mutationFn: (occurrence: Occurrence) => api.delete(`${BASE}/expense-occurrences/${occurrence.id}/settlement`, accessToken),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const cancelMutation = useMutation({
    mutationFn: (params: { occurrence: Occurrence; reason: string }) =>
      api.post(`${BASE}/expense-occurrences/${params.occurrence.id}/cancellation`, { reason: params.reason }, accessToken),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const deactivateMutation = useMutation({
    mutationFn: (occurrence: Occurrence) => api.patch(`${BASE}/expenses/${occurrence.expenseId}`, { active: false }, accessToken),
    onSuccess: () => {
      toast.success('Conta encerrada. Os próximos vencimentos foram cancelados.')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  // ---------- reajustar ----------
  const [adjusting, setAdjusting] = useState<Occurrence | null>(null)
  const [newAmount, setNewAmount] = useState('')

  const adjustMutation = useMutation({
    mutationFn: (occurrence: Occurrence) =>
      api.post(
        `${BASE}/expenses/${occurrence.expenseId}/amount-changes`,
        { newAmount: newAmount.trim(), kind: 'adjustment', effectiveFrom: occurrence.dueDate.slice(0, 7) },
        accessToken,
      ),
    onSuccess: () => {
      setAdjusting(null)
      toast.success('Valor reajustado a partir deste vencimento.')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const categoryOptions: SelectOption<string>[] = useMemo(
    () => (categoriesQuery.data?.data ?? []).filter((item) => item.active).map((item) => ({ value: item.id, label: item.name })),
    [categoriesQuery.data],
  )
  const occurrences = occurrencesQuery.data?.data ?? []
  const summary = summaryQuery.data?.data

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-800">
          {MONTH_NAMES[monthIndex]} {year}
        </h2>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Próximo mês" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Total do mês</p>
          <p className="text-xl font-bold text-gray-800">{formatBRL(summary?.total ?? 0)}</p>
        </div>
        <div className="bg-green-50 rounded-2xl shadow-sm p-4">
          <p className="text-xs text-green-600 mb-1">Pago</p>
          <p className="text-xl font-bold text-green-700">{formatBRL(summary?.paid ?? 0)}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl shadow-sm p-4">
          <p className="text-xs text-blue-600 mb-1">Em aberto</p>
          <p className="text-xl font-bold text-blue-700">{formatBRL(summary?.open ?? 0)}</p>
        </div>
        <div className="bg-red-50 rounded-2xl shadow-sm p-4">
          <p className="text-xs text-red-500 mb-1">Vencido</p>
          <p className="text-xl font-bold text-red-700">{formatBRL(summary?.overdue ?? 0)}</p>
        </div>
      </div>

      <div className="flex justify-end mb-3">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Lançar conta
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
        {occurrencesQuery.isLoading && <p className="p-6 text-sm text-gray-400">Carregando…</p>}
        {occurrencesQuery.isError && (
          <p className="p-6 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {errorMessage(occurrencesQuery.error)}
          </p>
        )}
        {!occurrencesQuery.isLoading && !occurrencesQuery.isError && occurrences.length === 0 && (
          <p className="p-6 text-sm text-gray-400">Nenhuma conta vence neste mês.</p>
        )}
        {occurrences.map((occurrence) => {
          const badge = situation(occurrence, today)
          return (
            <div key={occurrence.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {occurrence.expenseName}
                  {occurrence.installmentNumber !== null && occurrence.installmentsTotal !== null && (
                    <span className="text-gray-400 font-normal"> · parcela {occurrence.installmentNumber}/{occurrence.installmentsTotal}</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {occurrence.categoryName} · vence {formatDate(occurrence.dueDate)}
                  {occurrence.status === 'paid' && occurrence.paidAt && ` · paga em ${formatDate(occurrence.paidAt)}`}
                </p>
              </div>
              <span className={`self-start sm:self-center text-xs font-medium px-2 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
              <p className="sm:w-32 sm:text-right font-semibold text-gray-800">
                {formatBRL(occurrence.status === 'paid' ? (occurrence.paidAmount ?? occurrence.expectedAmount) : occurrence.expectedAmount)}
              </p>
              <div className="flex flex-wrap gap-1 sm:w-64 sm:justify-end">
                {occurrence.status === 'open' && (
                  <>
                    <Button size="sm" onClick={() => openPay(occurrence)}>
                      <CheckCircle className="h-4 w-4" /> Pagar
                    </Button>
                    {occurrence.expenseKind === 'fixed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAdjusting(occurrence)
                          setNewAmount(occurrence.expectedAmount.replace('.', ','))
                        }}
                      >
                        Reajustar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const reason = await confirmDialog({
                          title: 'Cancelar este vencimento?',
                          message: 'Ele sai do total do mês. A conta continua para os próximos meses.',
                          confirmLabel: 'Cancelar vencimento',
                          tone: 'danger',
                          input: { label: 'Motivo', minLength: 2, placeholder: 'Ex.: renegociado' },
                        })
                        if (reason) cancelMutation.mutate({ occurrence, reason })
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {occurrence.status === 'paid' && (
                  <Button size="sm" variant="ghost" loading={reopenMutation.isPending} onClick={() => reopenMutation.mutate(occurrence)}>
                    <RotateCcw className="h-4 w-4" /> Desfazer
                  </Button>
                )}
                {occurrence.expenseKind === 'fixed' && occurrence.status !== 'canceled' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          title: 'Encerrar esta conta fixa?',
                          message: 'Os vencimentos de hoje em diante são cancelados. Os já vencidos continuam em aberto.',
                          confirmLabel: 'Encerrar',
                          tone: 'danger',
                        })
                      ) {
                        deactivateMutation.mutate(occurrence)
                      }
                    }}
                  >
                    Encerrar
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Lançar conta">
        <div className="space-y-3">
          <Select ariaLabel="Tipo" options={KIND_OPTIONS} value={kind} onChange={setKind} />
          <input className={inputClass} placeholder="Nome (ex.: Aluguel do salão)" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          <Select ariaLabel="Categoria" placeholder="Categoria" options={categoryOptions} value={categoryId} onChange={setCategoryId} />
          <input className={inputClass} inputMode="decimal" placeholder="Valor (ex.: 1.500,00)" value={amount} onChange={(event) => setAmount(event.target.value)} />
          {kind === 'fixed' ? (
            <>
              <Select ariaLabel="Frequência" options={RECURRENCE_OPTIONS} value={recurrence} onChange={setRecurrence} />
              {needsDueDay && (
                <input className={inputClass} type="number" min={1} max={31} placeholder="Dia do vencimento (1 a 31)" value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
              )}
              <input className={inputClass} type="number" min={2} max={600} placeholder="Parcelas (vazio = sem fim)" value={installments} onChange={(event) => setInstallments(event.target.value)} />
            </>
          ) : (
            <label className="block text-xs text-gray-500">
              Vencimento
              <input className={`${inputClass} mt-1`} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          )}
          <input className={inputClass} placeholder="Fornecedor (opcional)" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Voltar</Button>
            <Button disabled={!canCreate} loading={createMutation.isPending} loadingLabel="Lançando…" onClick={() => createMutation.mutate()}>
              Lançar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={paying !== null} onClose={() => setPaying(null)} title={paying ? `Pagar ${paying.expenseName}` : 'Pagar'} size="sm">
        <div className="space-y-3">
          <label className="block text-xs text-gray-500">
            Valor pago
            <input className={`${inputClass} mt-1`} inputMode="decimal" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} />
          </label>
          <label className="block text-xs text-gray-500">
            Data do pagamento
            <input className={`${inputClass} mt-1`} type="date" value={paidAt} max={today} onChange={(event) => setPaidAt(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPaying(null)}>Voltar</Button>
            <Button disabled={paidAmount.trim() === '' || paidAt === ''} loading={payMutation.isPending} onClick={() => paying && payMutation.mutate(paying)}>
              Confirmar pagamento
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={adjusting !== null} onClose={() => setAdjusting(null)} title="Reajustar valor" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">O valor novo vale deste vencimento em diante. O que já venceu ou foi pago não muda.</p>
          <input className={inputClass} inputMode="decimal" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAdjusting(null)}>Voltar</Button>
            <Button disabled={newAmount.trim() === ''} loading={adjustMutation.isPending} onClick={() => adjusting && adjustMutation.mutate(adjusting)}>
              Reajustar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
