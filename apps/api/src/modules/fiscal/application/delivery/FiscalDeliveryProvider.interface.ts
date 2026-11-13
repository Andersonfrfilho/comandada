export type FiscalDeliveryChannel = 'whatsapp' | 'email'

export type FiscalDeliveryPayload = {
  readonly to: string // phone (whatsapp) or e-mail address
  readonly customerName?: string | undefined
  readonly publicUrl: string
  readonly numeroDocumento: number | null
  readonly chaveAcesso: string | null
  readonly pdfUrl?: string | undefined
  // WhatsApp: a mensagem sai pelo número do restaurante, na conversa do pedido.
  readonly establishmentId?: string | undefined
  readonly orderCode?: string | undefined
}

export type FiscalDeliveryResult = {
  readonly ok: boolean
  readonly error?: string
}

export type FiscalDeliveryProvider = {
  readonly channel: FiscalDeliveryChannel
  deliver(payload: FiscalDeliveryPayload): Promise<FiscalDeliveryResult>
}

export function buildFiscalDeliveryMessage(payload: FiscalDeliveryPayload): string {
  const greeting = payload.customerName ? `Olá, ${payload.customerName}! ` : ''
  return `${greeting}Sua nota fiscal${buildFiscalDeliverySuffix(payload)} está disponível: ${payload.publicUrl}`
}

export function buildFiscalDeliverySubject(payload: FiscalDeliveryPayload): string {
  return `Sua nota fiscal${buildFiscalDeliverySuffix(payload)}`
}

export function buildFiscalWhatsappMessage(payload: FiscalDeliveryPayload): string {
  const greeting = payload.customerName ? `Oi, *${payload.customerName}*! 👋` : 'Oi! 👋'
  const order = payload.orderCode ? ` do pedido *${payload.orderCode}*` : ''
  return `${greeting}\n\n🧾 Sua nota fiscal${buildFiscalDeliverySuffix(payload)}${order} já está prontinha:\n${payload.publicUrl}\n\n_Guarde o link se precisar dela depois._ Obrigado pela preferência! 🧡`
}

// Uma linha, para o template de fora da janela de 24 h.
export function buildFiscalWhatsappTemplateText(payload: FiscalDeliveryPayload): string {
  return `A nota fiscal está disponível em ${payload.publicUrl} 🧾`
}

function buildFiscalDeliverySuffix(payload: FiscalDeliveryPayload): string {
  return payload.numeroDocumento ? ` nº ${payload.numeroDocumento}` : ''
}
