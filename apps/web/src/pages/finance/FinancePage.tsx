import { confirmDialog } from '@/stores/confirmStore'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { REVENUE_RULE_HINT } from '@/constants/paymentLabels'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useUpload } from '@/hooks/useUpload'
import { Modal } from '@/components/ui/Modal'
import { Select, type SelectOption } from '@/components/ui/Select'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { FilterBar, FilterField, FilterSelect, SearchField } from '@/components/ui/ListFilters'
import { formatPercent, matchesSearch, paginateRows, sortRows, toggleSort, type SortDirection, type SortState } from '@/lib/listing'
import { Banknote, Plus, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, AlertCircle } from 'lucide-react'
import { MarketplaceFinanceTab } from './MarketplaceFinanceTab'
import { AccountsPayableTab } from './AccountsPayableTab'
import type { MarketplaceOverview } from '@/lib/marketplaces'

interface Expense {
  id: string
  establishmentId: string
  description: string
  category: string
  amount: string
  expenseDate: string
  supplier: string | null
  receiptUrl: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface ExpensesResponse {
  expenses: Expense[]
  totalAmount: string
}

interface FinancialOverviewResponse {
  currentMonth: {
    revenue: string
    costs: string
    margin: number
    status: 'healthy' | 'warning' | 'critical'
  }
  breakEvenPoint: string
  monthlyEvolution: Array<{
    month: string
    revenue: number
    costs: number
    margin: number
  }>
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  ingredientes: 'Ingredientes',
  embalagens: 'Embalagens',
  limpeza: 'Limpeza',
  equipamentos: 'Equipamentos',
  marketing: 'Marketing',
  transporte: 'Transporte',
  impostos: 'Impostos',
  taxas: 'Taxas',
  outros: 'Outros',
}

const EXPENSE_CATEGORY_OPTIONS: readonly SelectOption<string>[] = [
  { value: 'ingredientes', label: 'Ingredientes' },
  { value: 'embalagens', label: 'Embalagens' },
  { value: 'limpeza', label: 'Limpeza' },
  { value: 'equipamentos', label: 'Equipamentos' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'taxas', label: 'Taxas' },
  { value: 'outros', label: 'Outros' },
]

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril',
  'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Tab = 'fixed' | 'variable' | 'report' | 'marketplaces'

const EXPENSES_PAGE_SIZE = 20

type ExpenseSortField = 'expenseDate' | 'description' | 'category' | 'amount'

function formatBRL(value: string | number): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatMonth(label: string): string {
  if (!label) return ''
  const [year, month] = label.split('-')
  if (!year || !month) return label
  const idx = parseInt(month) - 1
  if (idx < 0 || idx > 11) return label
  return `${MONTHS[idx].slice(0, 3)}/${year.slice(2)}`
}

function statusConfig(status: 'healthy' | 'warning' | 'critical'): {
  label: string
  icon: typeof TrendingUp
  bg: string
  text: string
  border: string
} {
  switch (status) {
    case 'healthy':
      return { label: 'Saudável', icon: TrendingUp, bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' }
    case 'warning':
      return { label: 'Atenção', icon: AlertTriangle, bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' }
    case 'critical':
      return { label: 'Crítico', icon: AlertCircle, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' }
  }
}

export function FinancePage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const { upload, uploading: receiptUploading } = useUpload()

  const [activeTab, setActiveTab] = useState<Tab>('fixed')
  // Aba das plataformas só aparece com iFood/99Food ligados e com API financeira.
  const { data: marketplaceOverview } = useQuery({
    queryKey: ['marketplaces-overview'],
    queryFn: () => api.get<MarketplaceOverview>('/marketplaces', accessToken ?? undefined),
    staleTime: 10 * 60_000,
    retry: false,
  })
  const marketplaceFinancePlatforms = (marketplaceOverview?.platforms ?? []).filter((item) => item.financial).map((item) => item.platform)
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())

  // Expense state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseCat, setExpenseCat] = useState('outros')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0])
  const [expenseSupplier, setExpenseSupplier] = useState('')
  const [expenseNotes, setExpenseNotes] = useState('')
  const [expenseReceiptUrl, setExpenseReceiptUrl] = useState<string | null>(null)

  // Overview query
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['financial-overview'],
    queryFn: () => api.get<FinancialOverviewResponse>('/finance/overview?months=6', accessToken ?? undefined),
  })

  // Expenses query
  const [expenseSearch, setExpenseSearch] = useState('')
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('')
  const [expenseSort, setExpenseSort] = useState<SortState<ExpenseSortField>>({ field: 'expenseDate', direction: 'desc' })
  const [expensePage, setExpensePage] = useState(1)

  const { data: expensesData, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', currentMonth, currentYear],
    queryFn: () => api.get<ExpensesResponse>(`/expenses?month=${currentMonth + 1}&year=${currentYear}`, accessToken ?? undefined),
  })

  const invalidateExpenses = () => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] })
    void queryClient.invalidateQueries({ queryKey: ['financial-overview'] })
  }

  // Expense form validation
  const expenseAmountNumber = parseFloat(expenseAmount)
  const isExpenseFormValid =
    expenseDesc.trim().length > 0 &&
    !isNaN(expenseAmountNumber) &&
    expenseAmountNumber > 0

  // Expense mutations
  const createExpenseMutation = useMutation({
    mutationFn: () =>
      api.post('/expenses', {
        description: expenseDesc.trim(),
        category: expenseCat,
        amount: expenseAmountNumber,
        expenseDate,
        ...(expenseSupplier.trim() ? { supplier: expenseSupplier.trim() } : {}),
        ...(expenseReceiptUrl ? { receiptUrl: expenseReceiptUrl } : {}),
        ...(expenseNotes.trim() ? { notes: expenseNotes.trim() } : {}),
      }, accessToken ?? undefined),
    onSuccess: () => { closeExpenseModal(); invalidateExpenses() },
  })

  const updateExpenseMutation = useMutation({
    mutationFn: (id: string) =>
      api.put(`/expenses/${id}`, {
        description: expenseDesc.trim(),
        category: expenseCat,
        amount: expenseAmountNumber,
        expenseDate,
        supplier: expenseSupplier.trim() || null,
        receiptUrl: expenseReceiptUrl,
        notes: expenseNotes.trim() || null,
      }, accessToken ?? undefined),
    onSuccess: () => { closeExpenseModal(); invalidateExpenses() },
  })

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/expenses/${id}`, accessToken ?? undefined),
    onSuccess: () => invalidateExpenses(),
  })

  // Modal handlers (expenses)
  function openCreateExpenseModal() {
    setEditingExpense(null)
    setExpenseDesc('')
    setExpenseCat('outros')
    setExpenseAmount('')
    setExpenseDate(new Date().toISOString().split('T')[0])
    setExpenseSupplier('')
    setExpenseNotes('')
    setExpenseReceiptUrl(null)
    setExpenseModalOpen(true)
  }

  function openEditExpenseModal(expense: Expense) {
    setEditingExpense(expense)
    setExpenseDesc(expense.description)
    setExpenseCat(expense.category)
    setExpenseAmount(expense.amount)
    setExpenseDate(expense.expenseDate)
    setExpenseSupplier(expense.supplier ?? '')
    setExpenseNotes(expense.notes ?? '')
    setExpenseReceiptUrl(expense.receiptUrl)
    setExpenseModalOpen(true)
  }

  function closeExpenseModal() {
    setExpenseModalOpen(false)
    setEditingExpense(null)
    setExpenseReceiptUrl(null)
  }

  async function handleReceiptUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const result = await upload(file)
      setExpenseReceiptUrl(result.url)
    } catch {
      // upload error handled by hook
    }
  }

  // Navigation
  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const expenses = expensesData?.expenses ?? []
  const filteredExpenses = sortRows(
    expenses.filter(
      (expense) =>
        (!expenseCategoryFilter || expense.category === expenseCategoryFilter) &&
        matchesSearch(expenseSearch, [expense.description, expense.supplier, expense.notes])
    ),
    (expense) =>
      expenseSort.field === 'amount'
        ? Number(expense.amount)
        : expenseSort.field === 'category'
          ? EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category
          : expense[expenseSort.field],
    expenseSort.direction
  )
  const visibleExpenses = paginateRows(filteredExpenses, expensePage, EXPENSES_PAGE_SIZE)
  const filteredExpensesTotal = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)
  const hasExpenseFilters = !!expenseSearch.trim() || !!expenseCategoryFilter

  function handleExpenseSort(field: ExpenseSortField, defaultDirection: SortDirection) {
    setExpenseSort((current) => toggleSort(current, field, defaultDirection))
    setExpensePage(1)
  }

  const expenseColumns: ReadonlyArray<DataTableColumn<Expense, ExpenseSortField>> = [
    {
      key: 'expenseDate',
      header: 'Data',
      sortField: 'expenseDate',
      defaultDirection: 'desc',
      render: (expense) => (
        <span className="text-gray-600 whitespace-nowrap">
          {expense.expenseDate ? new Date(expense.expenseDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Descrição',
      sortField: 'description',
      render: (expense) => (
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{expense.description}</p>
          {expense.supplier && <p className="text-xs text-gray-400 sm:hidden">{expense.supplier}</p>}
          {expense.notes && <p className="text-xs text-gray-400 truncate max-w-xs">{expense.notes}</p>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      sortField: 'category',
      className: 'hidden md:table-cell',
      render: (expense) => (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
          {EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}
        </span>
      ),
    },
    {
      key: 'supplier',
      header: 'Fornecedor',
      className: 'hidden sm:table-cell',
      render: (expense) => <span className="text-gray-600">{expense.supplier ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      sortField: 'amount',
      defaultDirection: 'desc',
      render: (expense) => <span className="font-semibold text-gray-900 whitespace-nowrap">{formatBRL(expense.amount)}</span>,
    },
    {
      key: 'actions',
      header: 'Ações',
      align: 'right',
      render: (expense) => (
        <div className="flex items-center justify-end gap-1">
          {expense.receiptUrl && (
            <a
              href={expense.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-600 hover:underline px-2 py-1"
            >
              Recibo
            </a>
          )}
          <button
            type="button"
            onClick={() => openEditExpenseModal(expense)}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await confirmDialog({ title: 'Excluir este gasto?', message: 'Ele sai do Financeiro e dos relatórios.', confirmLabel: 'Excluir', tone: 'danger' })) {
                deleteExpenseMutation.mutate(expense.id)
              }
            }}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 hover:bg-red-50 rounded-lg transition-colors"
          >
            Excluir
          </button>
        </div>
      ),
    },
  ]
  const totalExpenses = expensesData?.totalAmount ?? '0.00'

  const isSavingExpense = createExpenseMutation.isPending || updateExpenseMutation.isPending

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Financeiro</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          { key: 'fixed' as const, label: 'Contas a pagar', icon: Banknote },
          { key: 'variable' as const, label: 'Gastos Avulsos' },
          { key: 'report' as const, label: 'Parecer' },
          ...(marketplaceFinancePlatforms.length > 0 ? [{ key: 'marketplaces' as const, label: 'Marketplaces' }] : []),
        ] as Array<{ key: Tab; label: string; icon?: typeof Banknote }>).map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'marketplaces' && <MarketplaceFinanceTab platforms={marketplaceFinancePlatforms} />}

      {/* ===== CONTAS A PAGAR (módulo do SDK) ===== */}
      {activeTab === 'fixed' && <AccountsPayableTab />}

      {/* ===== GASTOS AVULSOS TAB ===== */}
      {activeTab === 'variable' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-800">
              {MONTHS[currentMonth]} {currentYear}
            </h2>
            <button
              type="button"
              onClick={goToNextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="bg-orange-50 rounded-2xl shadow-sm p-4 mb-4">
            <p className="text-xs text-orange-600 mb-1">Total de gastos este mês</p>
            <p className="text-xl font-bold text-orange-700">{formatBRL(totalExpenses)}</p>
          </div>

          <div className="mb-4">
            <button
              type="button"
              onClick={openCreateExpenseModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Novo gasto
            </button>
          </div>

          <FilterBar
            hasActiveFilters={hasExpenseFilters}
            onClear={() => {
              setExpenseSearch('')
              setExpenseCategoryFilter('')
              setExpensePage(1)
            }}
          >
            <SearchField
              value={expenseSearch}
              onChange={(value) => {
                setExpenseSearch(value)
                setExpensePage(1)
              }}
              placeholder="Descrição, fornecedor ou observação"
            />
            <FilterField label="Categoria">
              <FilterSelect
                value={expenseCategoryFilter}
                onChange={(value) => {
                  setExpenseCategoryFilter(value)
                  setExpensePage(1)
                }}
                options={Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
                allLabel="Todas"
              />
            </FilterField>
          </FilterBar>

          {hasExpenseFilters && filteredExpenses.length > 0 && (
            <p className="text-sm text-gray-500 mb-2">
              {filteredExpenses.length} de {expenses.length} gastos · {formatBRL(filteredExpensesTotal)}
            </p>
          )}

          <DataTable
            caption="Gastos do mês"
            columns={expenseColumns}
            rows={visibleExpenses}
            rowKey={(expense) => expense.id}
            isLoading={expensesLoading}
            emptyMessage={hasExpenseFilters ? 'Nenhum gasto com esses filtros.' : 'Nenhum gasto registrado este mês.'}
            sort={expenseSort}
            onSort={handleExpenseSort}
            minWidthClassName="min-w-0"
            footer={
              <Pagination
                page={expensePage}
                pageSize={EXPENSES_PAGE_SIZE}
                total={filteredExpenses.length}
                onPageChange={setExpensePage}
              />
            }
          />
        </>
      )}

      {/* ===== PARECER TAB ===== */}
      {activeTab === 'report' && (
        <>
          {overviewLoading ? (
            <p className="text-gray-400 text-center py-8">Carregando...</p>
          ) : overviewData ? (
            <div className="space-y-4">
              {/* Status banner */}
              <div className={`${statusConfig(overviewData.currentMonth.status).bg} ${statusConfig(overviewData.currentMonth.status).border} border rounded-2xl p-4 flex items-center gap-3`}>
                <span className={`${statusConfig(overviewData.currentMonth.status).text} font-semibold text-sm`}>
                  {statusConfig(overviewData.currentMonth.status).label}
                </span>
                <span className="text-sm text-gray-600">
                  {overviewData.currentMonth.status === 'healthy'
                    ? 'Sua operação está com boa margem'
                    : overviewData.currentMonth.status === 'warning'
                      ? 'Reduza custos para melhorar a margem'
                      : 'Margem crítica — ação imediata necessária'}
                </span>
              </div>

              {/* Revenue, Costs, Margin cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-2xl shadow-sm p-4">
                  <p className="text-xs text-blue-600 mb-1">Receita (mês)</p>
                  <p className="text-lg font-bold text-blue-700">{formatBRL(overviewData.currentMonth.revenue)}</p>
                  <p className="text-[11px] text-blue-500 mt-0.5">{REVENUE_RULE_HINT}</p>
                </div>
                <div className="bg-orange-50 rounded-2xl shadow-sm p-4">
                  <p className="text-xs text-orange-600 mb-1">Custos (mês)</p>
                  <p className="text-lg font-bold text-orange-700">{formatBRL(overviewData.currentMonth.costs)}</p>
                </div>
                <div className={`rounded-2xl shadow-sm p-4 ${overviewData.currentMonth.margin >= 20 ? 'bg-green-50' : overviewData.currentMonth.margin >= 10 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                  <p className="text-xs text-gray-600 mb-1">Margem</p>
                  <p className={`text-lg font-bold ${
                    overviewData.currentMonth.margin >= 20 ? 'text-green-700' : overviewData.currentMonth.margin >= 10 ? 'text-yellow-700' : 'text-red-700'
                  }`}>{formatPercent(overviewData.currentMonth.margin)}</p>
                </div>
              </div>

              {/* Break-even */}
              <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Ponto de equilíbrio</p>
                <p className="text-sm text-gray-700">
                  Você precisa faturar <span className="font-bold">{formatBRL(overviewData.breakEvenPoint)}</span>/mês para cobrir os custos fixos.
                </p>
              </div>

              {/* Monthly evolution chart (bar chart) */}
              <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolução mensal (6 meses)</h3>
                <div className="space-y-3">
                  {overviewData.monthlyEvolution.map((entry) => (
                    <div key={entry.month}>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>{formatMonth(entry.month)}</span>
                        <span className="flex gap-3">
                          <span className="text-blue-600">Rec: {formatBRL(entry.revenue)}</span>
                          <span className="text-orange-600">Cus: {formatBRL(entry.costs)}</span>
                          <span className={`font-semibold ${entry.margin >= 20 ? 'text-green-600' : entry.margin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {entry.margin}%
                          </span>
                        </span>
                      </div>
                      <div className="flex h-6 rounded-lg overflow-hidden bg-gray-100">
                        {entry.revenue > 0 && (
                          <>
                            <div
                              className="bg-blue-400 h-full flex items-center justify-center text-[10px] text-white font-semibold min-w-[2px]"
                              style={{ width: `${Math.min(100, (entry.revenue / (entry.revenue + entry.costs || 1)) * 100)}%` }}
                            />
                            <div
                              className="bg-orange-300 h-full flex items-center justify-center text-[10px] text-white font-semibold min-w-[2px]"
                              style={{ width: `${Math.max(0, Math.min(100, (entry.costs / (entry.revenue + entry.costs || 1)) * 100))}%` }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-400 rounded-sm" /> Receita</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-orange-300 rounded-sm" /> Custos</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">Não foi possível carregar o parecer financeiro.</p>
          )}
        </>
      )}

      {/* Expense modal */}
      <Modal open={expenseModalOpen} onClose={closeExpenseModal} title={editingExpense ? 'Editar gasto' : 'Novo gasto avulso'} size="md">
        <div className="p-5 space-y-4 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input
              type="text"
              value={expenseDesc}
              onChange={(e) => setExpenseDesc(e.target.value)}
              placeholder="Ex: Compra de ingredientes"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              maxLength={255}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <Select value={expenseCat} onChange={setExpenseCat} options={EXPENSE_CATEGORY_OPTIONS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
            <input
              type="number"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="0,00"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              min="0.01"
              step="0.01"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
              <input
                type="text"
                value={expenseSupplier}
                onChange={(e) => setExpenseSupplier(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                maxLength={255}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={expenseNotes}
              onChange={(e) => setExpenseNotes(e.target.value)}
              placeholder="Observações (opcional)"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              rows={2}
              maxLength={2000}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprovante</label>
            <div className="flex items-center gap-2">
              <label className="px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 cursor-pointer hover:bg-gray-50 transition-colors">
                {receiptUploading ? 'Enviando...' : 'Selecionar arquivo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleReceiptUpload}
                  className="hidden"
                  disabled={receiptUploading}
                />
              </label>
              {expenseReceiptUrl && (
                <span className="text-xs text-green-600 truncate max-w-[180px]">Comprovante enviado</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={closeExpenseModal}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (editingExpense) {
                  updateExpenseMutation.mutate(editingExpense.id)
                } else {
                  createExpenseMutation.mutate()
                }
              }}
              disabled={!isExpenseFormValid || isSavingExpense}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 hover:bg-brand-700 transition-colors"
            >
              {isSavingExpense ? 'Salvando...' : editingExpense ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
