import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Star } from 'lucide-react'
import { useAuthStore, useCan } from '@/stores/authStore'
import { api } from '@/lib/api'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { formatDateTime, formatDecimal } from '@/lib/listing'
import type { MarketplaceOverview, MarketplaceReview, MarketplaceReviewPage, MarketplaceReviewSummary } from '@/lib/marketplaces'

const PAGE_SIZE = 20
const MIN_ANSWER = 10
const MAX_ANSWER = 300

/**
 * Avaliações dos clientes nas plataformas (hoje só o iFood tem API). A resposta fica pública na loja,
 * então o iFood exige o link da política de avaliações perto do campo.
 */
export function MarketplaceReviewsSection() {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const { data: overview } = useQuery({
    queryKey: ['marketplaces-overview'],
    queryFn: () => api.get<MarketplaceOverview>('/marketplaces', accessToken),
    staleTime: 10 * 60_000,
    retry: false,
  })
  const target = overview?.reviewPlatforms[0]
  if (!target) return null
  return <ReviewsList platform={target.platform} label={target.label} policyUrl={target.policyUrl} />
}

function ReviewsList({ platform, label, policyUrl }: { platform: string; label: string; policyUrl: string }) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const [page, setPage] = useState(1)

  const summary = useQuery({
    queryKey: ['marketplace-reviews', platform, 'summary'],
    queryFn: () => api.get<MarketplaceReviewSummary>(`/marketplaces/reviews/summary?platform=${platform}`, accessToken),
    staleTime: 10 * 60_000,
  })
  const reviews = useQuery({
    queryKey: ['marketplace-reviews', platform, page],
    queryFn: () => api.get<MarketplaceReviewPage>(`/marketplaces/reviews?platform=${platform}&page=${page}&pageSize=${PAGE_SIZE}`, accessToken),
    staleTime: 60_000,
  })

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">Avaliações {label}</h2>
        <a href={policyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600">
          Política de avaliações do {label} <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {summary.data && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">Nota</p>
            <p className="flex items-center gap-1 text-lg font-bold text-gray-900">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {formatDecimal(summary.data.score, 1)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">Avaliações</p>
            <p className="text-lg font-bold text-gray-900">{summary.data.totalReviewsCount}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">Contam na nota</p>
            <p className="text-lg font-bold text-gray-900">{summary.data.validReviewsCount}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white p-4 shadow-sm">
        {reviews.isLoading && <p className="text-sm text-gray-400">Carregando…</p>}
        {reviews.isError && <p className="text-sm text-red-700">{reviews.error instanceof Error ? reviews.error.message : 'Erro ao buscar'}</p>}
        {reviews.data && reviews.data.reviews.length === 0 && <p className="text-sm text-gray-400">Nenhuma avaliação ainda.</p>}
        <ul className="divide-y divide-gray-100">
          {(reviews.data?.reviews ?? []).map((review) => (
            <ReviewItem key={review.id} review={review} platform={platform} policyUrl={policyUrl} label={label} />
          ))}
        </ul>
        {reviews.data && reviews.data.pageCount > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Anterior
            </Button>
            <span className="text-gray-500">
              {page} de {reviews.data.pageCount}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= reviews.data.pageCount} onClick={() => setPage((current) => current + 1)}>
              Próxima
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function ReviewItem({ review, platform, policyUrl, label }: { review: MarketplaceReview; platform: string; policyUrl: string; label: string }) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const queryClient = useQueryClient()
  const canAnswer = useCan({ resource: 'reports', action: 'write' })
  const [answering, setAnswering] = useState(false)
  const [text, setText] = useState('')
  const length = text.trim().length

  const answer = useMutation({
    mutationFn: () => api.post(`/marketplaces/reviews/${encodeURIComponent(review.id)}/answers`, { platform, text: text.trim() }, accessToken),
    onSuccess: () => {
      toast.success('Resposta publicada')
      setAnswering(false)
      setText('')
      void queryClient.invalidateQueries({ queryKey: ['marketplace-reviews', platform] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não deu certo agora'),
  })

  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-medium text-gray-900">
          {Array.from({ length: 5 }, (_, index) => (
            <Star key={index} className={`h-3.5 w-3.5 ${index < review.score ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
          ))}
          <span className="ml-1">{review.customerName ?? 'Cliente'}</span>
        </span>
        <span className="text-xs text-gray-500">
          {formatDateTime(review.createdAt)}
          {review.order?.displayId ? ` · pedido #${review.order.displayId}` : ''}
        </span>
      </div>
      {review.comment && <p className="mt-1 text-gray-700">{review.comment}</p>}
      {review.replies.map((reply, index) => (
        <p key={index} className="mt-1 rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">
          <strong>{reply.from === 'MERCHANT' ? 'Loja' : reply.from}:</strong> {reply.text}
        </p>
      ))}
      {review.canReply && canAnswer && !answering && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAnswering(true)}>
          Responder
        </Button>
      )}
      {answering && (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_ANSWER}
            rows={3}
            placeholder="Sua resposta aparece na loja para todos os clientes"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              {length}/{MAX_ANSWER} · mínimo {MIN_ANSWER} ·{' '}
              <a href={policyUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600">
                política de avaliações do {label}
              </a>
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAnswering(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={length < MIN_ANSWER} loading={answer.isPending} onClick={() => answer.mutate()}>
                Publicar resposta
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
