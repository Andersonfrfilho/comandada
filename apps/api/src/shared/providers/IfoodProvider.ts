const IFOOD_AUTH_URL = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token'
const IFOOD_API_BASE = 'https://merchant-api.ifood.com.br'

export interface IfoodOrder {
  id: string
  displayId: string
  createdAt: string
  customer: { name: string; phone: string }
  items: Array<{ name: string; quantity: number; unitPrice: number }>
  total: number
  deliveryAddress?: {
    street: string
    number: string
    neighborhood: string
    city: string
    state: string
    zip: string
  }
  paymentMethod: string
}

interface TokenCache {
  accessToken: string
  expiresAt: number
}

interface IfoodEvent {
  id: string
  code: string
}

interface IfoodApiEventResponse {
  id: string
  code: string
  correlationId: string
  createdAt: string
}

interface IfoodApiOrder {
  id: string
  displayId: string
  createdAt: string
  customer: {
    name: string
    phone: { number: string; localizer: string; localizerExpiration: string }
  }
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  total: {
    benefits: number
    deliveryFee: number
    orderAmount: number
    subTotal: number
  }
  delivery: {
    deliveryAddress: {
      streetName: string
      streetNumber: string
      neighborhood: string
      city: string
      state: string
      postalCode: string
    }
  }
  payments: Array<{
    method: { type: string }
  }>
}

interface IfoodConfig {
  clientId: string
  clientSecret: string
  merchantId: string
}

export class IfoodProvider {
  private readonly config: IfoodConfig
  private tokenCache: TokenCache | null = null

  constructor(config: IfoodConfig) {
    this.config = config
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.accessToken
    }

    const params = new URLSearchParams()
    params.append('grant_type', 'client_credentials')
    params.append('client_id', this.config.clientId)
    params.append('client_secret', this.config.clientSecret)

    const response = await fetch(IFOOD_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`IfoodProvider auth failed: ${response.status} ${body}`)
    }

    const data = (await response.json()) as {
      access_token: string
      expires_in: number
    }

    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 120) * 1000,
    }

    return data.access_token
  }

  async pollEvents(): Promise<IfoodEvent[]> {
    const token = await this.getAccessToken()
    const url = `${IFOOD_API_BASE}/events/v1.0/events:polling?types=PLACED`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[IfoodProvider] pollEvents failed: ${response.status} ${body}`)
      return []
    }

    const data = (await response.json()) as IfoodApiEventResponse[]
    return data.map((event) => ({
      id: event.id,
      code: event.code,
    }))
  }

  async getOrder(orderId: string): Promise<IfoodOrder | null> {
    const token = await this.getAccessToken()
    const url = `${IFOOD_API_BASE}/order/v1.0/orders/${orderId}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[IfoodProvider] getOrder failed: ${response.status} ${body}`)
      return null
    }

    const data = (await response.json()) as IfoodApiOrder

    const delivery = data.delivery?.deliveryAddress
    const paymentMethod =
      data.payments?.[0]?.method?.type ?? 'desconhecido'

    const order: IfoodOrder = {
      id: data.id,
      displayId: data.displayId,
      createdAt: data.createdAt,
      customer: {
        name: data.customer?.name ?? 'Cliente iFood',
        phone: data.customer?.phone?.number ?? '',
      },
      items: (data.items ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      total: data.total?.orderAmount ?? 0,
      paymentMethod,
    }

    if (delivery) {
      order.deliveryAddress = {
        street: delivery.streetName ?? '',
        number: delivery.streetNumber ?? '',
        neighborhood: delivery.neighborhood ?? '',
        city: delivery.city ?? '',
        state: delivery.state ?? '',
        zip: delivery.postalCode ?? '',
      }
    }

    return order
  }

  async acknowledgeEvent(eventId: string): Promise<void> {
    const token = await this.getAccessToken()
    const url = `${IFOOD_API_BASE}/events/v1.0/events/acknowledgment`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ id: eventId }]),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[IfoodProvider] acknowledgeEvent failed: ${response.status} ${body}`)
    }
  }

  async acceptOrder(orderId: string): Promise<void> {
    const token = await this.getAccessToken()
    const url = `${IFOOD_API_BASE}/order/v1.0/orders/${orderId}/confirm`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`IfoodProvider acceptOrder failed: ${response.status} ${body}`)
    }
  }

  async rejectOrder(orderId: string, reason: string): Promise<void> {
    const token = await this.getAccessToken()
    const url = `${IFOOD_API_BASE}/order/v1.0/orders/${orderId}/reject`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`IfoodProvider rejectOrder failed: ${response.status} ${body}`)
    }
  }

  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    const token = await this.getAccessToken()
    const url = `${IFOOD_API_BASE}/order/v1.0/orders/${orderId}/status`

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[IfoodProvider] updateOrderStatus failed: ${status} — ${response.status} ${body}`)
    }
  }
}
