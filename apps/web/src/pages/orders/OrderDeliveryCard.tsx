import { useQuery } from '@tanstack/react-query'
import { Clock, ExternalLink, MapPin, Navigation, Route } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import {
  formatBrl,
  formatDistance,
  formatDuration,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
  type MapPoint,
} from './orderDetailFormat'

interface OrderRoute {
  origin: MapPoint | null
  destination: MapPoint | null
  distanceKm: number | null
  durationMin: number | null
  source: 'route' | 'straight_line' | null
}

interface OrderDeliveryCardProps {
  orderId: string
  address: string
  complement: string | null
  feeAmount: string
  /** Distância gravada quando a taxa foi calculada por km; vale até a rota chegar. */
  savedDistanceKm: string | null
}

export function OrderDeliveryCard({ orderId, address, complement, feeAmount, savedDistanceKm }: OrderDeliveryCardProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const { data: route, isLoading } = useQuery({
    queryKey: ['order-route', orderId],
    queryFn: () => api.get<OrderRoute>(`/orders/${orderId}/route`, accessToken ?? undefined),
    // Endereço do pedido não muda: uma consulta por pedido basta.
    staleTime: Infinity,
    retry: false,
  })

  const destination = route?.destination ?? null
  const distance = formatDistance(route?.distanceKm ?? savedDistanceKm)
  const duration = formatDuration(route?.durationMin)
  const isStraightLine = route?.source === 'straight_line' || (!route?.source && Boolean(savedDistanceKm))
  const fee = parseFloat(feeAmount)

  return (
    <section className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
      <div className="p-4 pb-3">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Entrega</h2>
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-brand-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-gray-800">{address}</p>
            {complement && <p className="text-xs text-gray-500">{complement}</p>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {distance && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              <Route className="h-3.5 w-3.5" />
              {distance}
              {isStraightLine ? ' em linha reta' : ''}
            </span>
          )}
          {duration && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              <Clock className="h-3.5 w-3.5" />~{duration} de carro
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
            Taxa: {Number.isFinite(fee) && fee > 0 ? formatBrl(fee) : 'grátis'}
          </span>
          {isLoading && !distance && <span className="px-1 py-1 text-gray-400">Calculando distância…</span>}
        </div>
      </div>

      <iframe
        title={`Mapa: ${address}`}
        src={googleMapsEmbedUrl(address, destination)}
        className="block w-full h-56 md:h-64 border-0 bg-gray-100"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <a
          href={googleMapsSearchUrl(address, destination)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir no Maps
        </a>
        <a
          href={googleMapsDirectionsUrl(address, destination, route?.origin)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Navigation className="h-4 w-4" />
          Traçar rota
        </a>
      </div>
    </section>
  )
}
