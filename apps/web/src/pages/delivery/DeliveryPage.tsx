import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'

interface DeliveryOrder {
  id: string
  status: 'pending' | 'dispatched' | 'delivered' | 'failed'
  addressSnapshot: Record<string, string>
  deliverer: { id: string; name: string } | null
  order: {
    id: string
    totalAmount: string
    items: Array<{ productName: string; quantity: number }>
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  dispatched: 'Em rota',
  delivered: 'Entregue',
  failed: 'Falhou',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  dispatched: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

// Pedidos novos (painel e WhatsApp) gravam o endereço numa linha só em `address`; os antigos
// vinham em `street` e `number`.
function formatDeliveryAddress(snapshot: Record<string, string>): string {
  if (snapshot['address']) return snapshot['address']
  return [snapshot['street'], snapshot['number']].filter(Boolean).join(', ')
}

export function DeliveryPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const { data: deliveries = [] } = useQuery({
    queryKey: ['delivery', 'queue'],
    queryFn: () => api.get<DeliveryOrder[]>('/delivery/queue', accessToken ?? undefined),
    refetchInterval: 20_000,
  })

  useWebSocket((message) => {
    if (message.type.startsWith('delivery:') || message.type === 'order:status_changed') {
      void queryClient.invalidateQueries({ queryKey: ['delivery', 'queue'] })
    }
  })

  async function handleUpdateStatus(deliveryId: string, status: string) {
    await api.patch(`/delivery/${deliveryId}/status`, { status }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['delivery', 'queue'] })
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Entregas</h1>
      <div className="space-y-3">
        {deliveries.map((delivery) => (
          <div key={delivery.id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[delivery.status]}`}>
                {STATUS_LABELS[delivery.status]}
              </span>
              <span className="text-sm font-bold">R$ {parseFloat(delivery.order.totalAmount).toFixed(2)}</span>
            </div>

            <div className="text-sm text-gray-600 mb-3">
              {formatDeliveryAddress(delivery.addressSnapshot)}
              {delivery.addressSnapshot['complement'] && ` - ${delivery.addressSnapshot['complement']}`}
            </div>

            <div className="text-xs text-gray-500 mb-3">
              {delivery.order.items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')}
            </div>

            {delivery.deliverer && (
              <div className="text-xs text-gray-500 mb-3">
                Entregador: <span className="font-medium text-gray-700">{delivery.deliverer.name}</span>
              </div>
            )}

            <div className="flex gap-2">
              {delivery.status === 'pending' && (
                <button
                  onClick={() => handleUpdateStatus(delivery.id, 'dispatched')}
                  className="w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
                >
                  Sair para entrega
                </button>
              )}
              {delivery.status === 'dispatched' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus(delivery.id, 'delivered')}
                    className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg"
                  >
                    Entregue
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(delivery.id, 'failed')}
                    className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg"
                  >
                    Falhou
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {deliveries.length === 0 && (
          <p className="text-gray-400 text-center py-12">Nenhuma entrega ativa</p>
        )}
      </div>
    </div>
  )
}
