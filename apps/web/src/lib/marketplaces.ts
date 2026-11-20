// Tipos e textos das telas de marketplace (iFood, 99Food). Espelham as rotas /marketplaces da API.

export type MarketplacePlatform = 'ifood' | '99food'

export interface MarketplaceDisputeAlternative {
  id: string
  type: 'refund' | 'additional_time' | 'other'
  maxAmount?: number
  minutes?: number[]
  reasons?: string[]
}

export interface MarketplaceDispute {
  externalId: string
  orderExternalId: string
  kind: string
  message?: string
  expiresAt?: string
  timeoutAction?: string
  alternatives: MarketplaceDisputeAlternative[]
  reasons?: string[]
  items?: Array<{ name?: string; quantity?: number; amount?: number; reason?: string }>
  evidenceUrls?: string[]
}

export interface MarketplaceDisputeView {
  id: string
  platform: MarketplacePlatform
  orderId: string | null
  externalOrderId: string
  kind: string
  message: string | null
  expiresAt: string | null
  status: string
  dispute: MarketplaceDispute
  response: unknown
  createdAt: string
}

export interface MarketplaceOrderView {
  platform: MarketplacePlatform
  label: string
  externalId: string
  displayId: string | null
  platformStatus: string
  deliveredBy: string | null
  connected: boolean
  disputes: MarketplaceDisputeView[]
}

export interface MarketplaceCancellationReason {
  code: string
  description: string
}

export type MarketplaceDisputeResponse =
  | { decision: 'accept'; reason?: string }
  | { decision: 'reject'; reason: string }
  | { decision: 'alternative'; alternativeId: string; amount?: number; minutes?: number; reason?: string }

export interface MarketplaceSale {
  platform: MarketplacePlatform
  merchantId: string
  externalOrderId: string
  displayId?: string
  date: string
  status: string
  paymentMethod?: string
  paymentLiability?: string
  grossAmount: number
  entries: Array<{ label: string; amount: number }>
  netAmount: number
  expectedTransferDate?: string
}

export interface MarketplaceSettlement {
  platform: MarketplacePlatform
  merchantId: string
  id: string
  periodStart?: string
  periodEnd?: string
  paymentDate?: string
  amount: number
  status: string
  type?: string
}

export interface MarketplaceFinancialResult<T> {
  platforms: MarketplacePlatform[]
  items: T[]
  errors: Array<{ platform: MarketplacePlatform; message: string }>
}

export interface MarketplaceOverview {
  platforms: Array<{ platform: MarketplacePlatform; label: string; financial: boolean; reviews: boolean }>
  reviewPlatforms: Array<{ platform: MarketplacePlatform; label: string; policyUrl: string; merchantIds: string[] }>
}

export interface MarketplaceReview {
  id: string
  score: number
  comment?: string
  customerName?: string
  createdAt: string
  status: string
  canReply: boolean
  replies: Array<{ text: string; from: string; createdAt?: string }>
  order?: { id: string; displayId?: string; createdAt?: string }
}

export interface MarketplaceReviewPage {
  reviews: MarketplaceReview[]
  page: number
  pageCount: number
  total: number
}

export interface MarketplaceReviewSummary {
  score: number
  totalReviewsCount: number
  validReviewsCount: number
}

export const MARKETPLACE_LABELS: Record<MarketplacePlatform, string> = { ifood: 'iFood', '99food': '99Food' }

/** O que a plataforma sabe do pedido (último aviso enviado ou recebido). */
export const PLATFORM_STATUS_LABELS: Record<string, string> = {
  placed: 'Aguardando aceite',
  confirm: 'Aceito',
  confirmed: 'Aceito',
  startPreparation: 'Em preparo',
  readyForPickup: 'Pronto',
  dispatch: 'Saiu para entrega',
  delivered: 'Entregue',
  pickedUp: 'Retirado',
  concluded: 'Concluído',
  cancelled: 'Cancelado',
  cancellation_requested: 'Cancelamento pedido (aguardando a plataforma)',
}

export const DISPUTE_KIND_LABELS: Record<string, string> = {
  cancellation: 'Pedido de cancelamento',
  partial_cancellation: 'Cancelamento de itens',
  refund: 'Pedido de reembolso',
  delay: 'Reclamação de atraso',
  other: 'Negociação',
}

export const DISPUTE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: 'Aguardando resposta', className: 'bg-amber-100 text-amber-800' },
  responded: { label: 'Respondida', className: 'bg-blue-100 text-blue-800' },
  accepted: { label: 'Aceita', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Recusada', className: 'bg-gray-200 text-gray-700' },
  alternative_replied: { label: 'Cliente respondeu à proposta', className: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Prazo vencido', className: 'bg-red-100 text-red-700' },
}

/** "4 min 12 s" até o prazo; null quando já passou. */
export function timeLeftLabel(expiresAt: string | null | undefined, now: number): string | null {
  if (!expiresAt) return null
  const milliseconds = Date.parse(expiresAt) - now
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} h ${minutes} min`
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`
}

/** Planilha das vendas (ponto e vírgula e vírgula decimal: abre direto no Excel em português). */
export function salesCsv(sales: MarketplaceSale[]): string {
  const money = (value: number) => value.toFixed(2).replace('.', ',')
  const escape = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const header = ['Plataforma', 'Loja', 'Pedido', 'Data', 'Situação', 'Pagamento', 'Bruto', 'Taxas e ajustes', 'Líquido', 'Repasse previsto', 'Detalhe']
  const rows = sales.map((sale) => {
    // Diferença entre o que o cliente pagou e o que a plataforma repassa (bate com o resumo da tela).
    const adjustments = sale.netAmount - sale.grossAmount
    return [
      MARKETPLACE_LABELS[sale.platform],
      sale.merchantId,
      sale.displayId ?? sale.externalOrderId,
      sale.date,
      sale.status,
      sale.paymentMethod ?? '',
      money(sale.grossAmount),
      money(adjustments),
      money(sale.netAmount),
      sale.expectedTransferDate ?? '',
      sale.entries.map((entry) => `${entry.label}: ${money(entry.amount)}`).join(' | '),
    ]
      .map((cell) => escape(String(cell)))
      .join(';')
  })
  return `﻿${[header.join(';'), ...rows].join('\n')}\n`
}

/** Soma bruto, ajustes e líquido do período. */
export function salesTotals(sales: MarketplaceSale[]): { gross: number; adjustments: number; net: number; count: number } {
  const round = (value: number) => Math.round(value * 100) / 100
  const gross = sales.reduce((sum, sale) => sum + sale.grossAmount, 0)
  const net = sales.reduce((sum, sale) => sum + sale.netAmount, 0)
  return { gross: round(gross), net: round(net), adjustments: round(net - gross), count: sales.length }
}

/** Mesma chave no card do pedido e no controle de status (o cache é dividido). */
export function marketplaceOrderQueryKey(orderId: string) {
  return ['order', orderId, 'marketplace'] as const
}

/** Pedido da plataforma ligada e ainda aberto lá: o cancelamento passa pela plataforma. */
export function cancelsOnPlatform(view: MarketplaceOrderView | null | undefined): boolean {
  return Boolean(view?.connected && view.platformStatus !== 'cancelled' && view.platformStatus !== 'concluded')
}
