/** Textos e códigos do módulo de pedidos que aparecem em mais de um lugar. */

/** Ação registrada na trilha de auditoria ao pedir confirmação parcial ao cliente. */
export const PARTIAL_CONFIRMATION_AUDIT_ACTION = 'order.partial_confirmation_requested'

export const ORDER_RESOURCE_TYPE = 'order'

/** Status em que o pedido já não admite negociação de itens com o cliente. */
export const ORDER_CLOSED_STATUSES = ['completed', 'cancelled'] as const

export const PARTIAL_CONFIRMATION_MESSAGES = {
  greetingWithName: (customerName: string) => `Oi, *${customerName}*! 👋`,
  greetingWithoutName: 'Oi! 👋',
  unavailableIntro: 'Poxa, precisamos te avisar: estes itens do seu pedido acabaram agora há pouco 😕',
  remainingIntro: '✅ *Continua tudo certo com:*',
  // "dos itens" e não "do pedido": taxa de entrega não entra nesta soma.
  newTotal: (formattedTotal: string) => `💰 Novo valor dos itens: *${formattedTotal}*`,
  confirmationRequest:
    'Podemos seguir só com o que temos? Responda *SIM* para continuar ou *NÃO* para cancelar o pedido.',
} as const

// Pergunta de confirmação parcial: uma pendente por pedido; pedir de novo substitui a anterior.
export const PARTIAL_CONFIRMATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  SUPERSEDED: 'superseded',
} as const

export const PARTIAL_CONFIRMATION_DECLINED_REASON = 'Cliente não quis seguir sem os itens em falta (confirmação parcial).'

export const ORDER_ERROR_MESSAGES = {
  noCustomerWhatsapp: 'Pedido sem cliente com WhatsApp — não há para quem enviar a mensagem.',
  closedOrder: 'Pedido já concluído ou cancelado não aceita confirmação parcial.',
  unknownItems: 'Um ou mais itens informados não pertencem a este pedido.',
  allItemsUnavailable:
    'Todos os itens estão em falta — cancele o pedido em vez de pedir confirmação parcial.',
} as const

// Previsão de entrega: sem histórico ainda, a estimativa é o preparo do item mais demorado,
// mais a fila da cozinha, mais o trajeto quando é entrega. Settings de mesmo nome sobrescrevem.
export const ORDER_ESTIMATE_DEFAULTS = {
  preparationMinutes: 25,
  queueMinutesPerOrder: 5,
  maxQueueMinutes: 60,
  deliveryMinutes: 20,
} as const

// A previsão passa a usar a média real (preparo por produto, tempo de rua da entrega) quando há
// amostras suficientes no período; abaixo disso fica com o cadastro e os valores fixos acima.
export const ORDER_ESTIMATE_HISTORY = {
  days: 30,
  minSamples: 5,
} as const

export const ORDER_ESTIMATE_SETTING_KEYS = {
  preparationMinutes: 'default_preparation_minutes',
  deliveryMinutes: 'delivery_minutes',
} as const

export const ORDER_ACTIVE_KITCHEN_STATUSES = ['received', 'in_production'] as const

// Mensagem ao cliente do WhatsApp quando o painel muda o status; status ausente não avisa.
export const ORDER_STATUS_CUSTOMER_MESSAGES = {
  in_production: (code: string) => `👨‍🍳 *Mão na massa!*\n\nSeu pedido *${code}* já está sendo preparado com todo carinho. Te aviso quando ficar pronto! 😋`,
  ready_pickup: (code: string) => `✅ *Prontinho!*\n\nSeu pedido *${code}* já está te esperando aqui no balcão. É só vir buscar! 🛍️`,
  ready_table: (code: string) => `✅ *Prontinho!*\n\nSeu pedido *${code}* já está saindo para a sua mesa. Bom apetite! 🍽️`,
  in_delivery: (code: string) => `🛵 *Saiu para entrega!*\n\nSeu pedido *${code}* já está a caminho. Fica de olho que daqui a pouco ele chega aí! 😉`,
  delivered: (code: string) => `🎉 *Pedido entregue!*\n\nEsperamos que você aproveite cada pedacinho do *${code}*. Bom apetite! 😋\n\n_Se algo não veio como esperado, é só digitar *ajuda*._`,
  cancelled: (code: string) => `😕 *Seu pedido ${code} foi cancelado.*\n\nSe ficou alguma dúvida, é só responder esta mensagem que a gente te explica. 🧡`,
} as const

// Mesmo aviso em uma linha, para o template de fora da janela de 24 h (sem quebra de linha).
export const ORDER_STATUS_TEMPLATE_TEXTS = {
  in_production: 'Ele já está sendo preparado com todo carinho! 👨‍🍳',
  ready_pickup: 'Ele está pronto e te esperando no balcão! 🛍️',
  ready_table: 'Ele está pronto e saindo para a sua mesa! 🍽️',
  in_delivery: 'Ele saiu para entrega e já está a caminho! 🛵',
  delivered: 'Ele foi entregue. Bom apetite! 😋',
  cancelled: 'Ele foi cancelado. Se tiver dúvida, responda esta mensagem. 🧡',
} as const
