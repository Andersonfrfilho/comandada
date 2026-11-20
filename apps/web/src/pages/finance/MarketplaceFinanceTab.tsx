import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { FilterSelect } from '@/components/ui/ListFilters'
import { Select } from '@/components/ui/Select'
import { formatBRL, formatDate } from '@/lib/listing'
import {
  MARKETPLACE_LABELS,
  salesCsv,
  salesTotals,
  type MarketplaceFinancialResult,
  type MarketplacePlatform,
  type MarketplaceSale,
  type MarketplaceSettlement,
} from '@/lib/marketplaces'

const SAO_PAULO = 'America/Sao_Paulo'

function isoDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO }).format(date)
}

function daysAgo(days: number): string {
  return isoDay(new Date(Date.now() - days * 86_400_000))
}

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
] as const

type Period = (typeof PERIOD_OPTIONS)[number]['value']

interface MarketplaceFinanceTabProps {
  platforms: MarketplacePlatform[]
}

/**
 * Vendas, taxas e repasses das plataformas, direto das APIs financeiras (iFood Financial v3, 99Food).
 * Mostra o que a plataforma vai pagar, para conferir com o extrato do banco.
 */
export function MarketplaceFinanceTab({ platforms }: MarketplaceFinanceTabProps) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const [period, setPeriod] = useState<Period>('30')
  const [platform, setPlatform] = useState<'' | MarketplacePlatform>('')
  const range = useMemo(() => ({ from: daysAgo(Number(period) - 1), to: isoDay(new Date()) }), [period])
  const query = new URLSearchParams({ from: range.from, to: range.to, ...(platform ? { platform } : {}) }).toString()

  const sales = useQuery({
    queryKey: ['marketplace-financial', 'sales', query],
    queryFn: () => api.get<MarketplaceFinancialResult<MarketplaceSale>>(`/marketplaces/financial/sales?${query}`, accessToken),
    staleTime: 5 * 60_000,
  })
  const settlements = useQuery({
    queryKey: ['marketplace-financial', 'settlements', query],
    queryFn: () => api.get<MarketplaceFinancialResult<MarketplaceSettlement>>(`/marketplaces/financial/settlements?${query}`, accessToken),
    staleTime: 5 * 60_000,
  })

  const items = sales.data?.items ?? []
  const totals = salesTotals(items)
  const errors = [...(sales.data?.errors ?? []), ...(settlements.data?.errors ?? [])]
  const uniqueErrors = [...new Map(errors.map((error) => [error.platform, error])).values()]

  function downloadCsv() {
    const blob = new Blob([salesCsv(items)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `vendas-marketplaces-${range.from}-a-${range.to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select size="sm" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} ariaLabel="Período" />
        {platforms.length > 1 && (
          <FilterSelect
            value={platform}
            onChange={setPlatform}
            options={platforms.map((item) => ({ value: item, label: MARKETPLACE_LABELS[item] }))}
            ariaLabel="Plataforma"
            allLabel="Todas as plataformas"
          />
        )}
        <Button variant="secondary" size="sm" className="ml-auto" disabled={items.length === 0} onClick={downloadCsv}>
          <Download className="h-4 w-4" /> Planilha
        </Button>
      </div>

      {uniqueErrors.map((error) => (
        <p key={error.platform} className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error.message}
        </p>
      ))}
      {(sales.isError || settlements.isError) && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {(sales.error ?? settlements.error) instanceof Error ? (sales.error ?? settlements.error)!.message : 'Erro ao consultar'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Total label="Vendas" value={String(totals.count)} />
        <Total label="Bruto" value={formatBRL(totals.gross)} />
        <Total label="Taxas e ajustes" value={formatBRL(totals.adjustments)} tone={totals.adjustments < 0 ? 'negative' : 'neutral'} />
        <Total label="Líquido a receber" value={formatBRL(totals.net)} tone="positive" />
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Repasses</h2>
        {settlements.isLoading && <p className="text-sm text-gray-400">Carregando…</p>}
        {!settlements.isLoading && (settlements.data?.items ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum repasse no período.</p>
        )}
        <ul className="divide-y divide-gray-100">
          {(settlements.data?.items ?? []).map((settlement) => (
            <li key={`${settlement.platform}-${settlement.merchantId}-${settlement.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="text-gray-800">
                {MARKETPLACE_LABELS[settlement.platform]} · {settlement.type ?? 'Repasse'}
                {settlement.periodStart && settlement.periodEnd ? (
                  <span className="text-gray-500"> · vendas de {formatDate(settlement.periodStart)} a {formatDate(settlement.periodEnd)}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {settlement.status}
                  {settlement.paymentDate ? ` · ${formatDate(settlement.paymentDate)}` : ''}
                </span>
                <span className={`font-semibold ${settlement.amount < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatBRL(settlement.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Vendas e taxas por pedido</h2>
        {sales.isLoading && <p className="text-sm text-gray-400">Carregando…</p>}
        {!sales.isLoading && items.length === 0 && <p className="text-sm text-gray-400">Nenhuma venda no período.</p>}
        <ul className="divide-y divide-gray-100">
          {items.map((sale) => (
            <li key={`${sale.platform}-${sale.externalOrderId}-${sale.date}-${sale.status}`} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-gray-900">
                  {MARKETPLACE_LABELS[sale.platform]} #{sale.displayId ?? sale.externalOrderId.slice(0, 8)}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {formatDate(sale.date.replace(' ', 'T'))} · {sale.status}
                    {sale.paymentMethod ? ` · ${sale.paymentMethod}` : ''}
                  </span>
                </span>
                <span className="text-gray-900">
                  {formatBRL(sale.grossAmount)} → <strong>{formatBRL(sale.netAmount)}</strong>
                </span>
              </div>
              {sale.entries.length > 0 && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {sale.entries.map((entry) => `${entry.label} ${formatBRL(entry.amount)}`).join(' · ')}
                  {sale.expectedTransferDate ? ` · repasse ${formatDate(sale.expectedTransferDate)}` : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Total({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'positive' | 'negative' | 'neutral' }) {
  const color = tone === 'positive' ? 'text-green-700' : tone === 'negative' ? 'text-red-700' : 'text-gray-900'
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}
