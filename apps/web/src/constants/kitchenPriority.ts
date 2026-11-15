export type KitchenUrgency = 'late' | 'now' | 'soon' | 'ok'
export type KitchenDeadlineSource = 'scheduled' | 'promised' | 'estimated'

export const KITCHEN_URGENCY_LABELS: Record<KitchenUrgency, string> = {
  late: 'Atrasando',
  now: 'Começar já',
  soon: 'Em breve',
  ok: 'Com folga',
}

export const KITCHEN_URGENCY_BORDER: Record<KitchenUrgency, string> = {
  late: 'border-red-500',
  now: 'border-orange-500',
  soon: 'border-yellow-400',
  ok: 'border-green-500',
}

export const KITCHEN_URGENCY_TEXT: Record<KitchenUrgency, string> = {
  late: 'text-red-600',
  now: 'text-orange-600',
  soon: 'text-yellow-700',
  ok: 'text-green-600',
}

export const KITCHEN_URGENCY_CHIP: Record<KitchenUrgency, string> = {
  late: 'bg-red-100 text-red-700',
  now: 'bg-orange-100 text-orange-700',
  soon: 'bg-yellow-100 text-yellow-800',
  ok: 'bg-green-100 text-green-700',
}

export const KITCHEN_DEADLINE_SOURCE_LABELS: Record<KitchenDeadlineSource, string> = {
  scheduled: 'hora marcada',
  promised: 'previsão dada ao cliente',
  estimated: 'tempo padrão da casa',
}

export const KITCHEN_PRIORITY_MESSAGES = {
  doNow: 'Fazer agora',
  waiting: 'esperando',
  startBy: 'Começar até',
  readyBy: 'Pronto até',
  route: (minutes: number) => `${minutes} min de rua`,
  preparation: (minutes: number) => `preparo ${minutes} min`,
  slackLate: (minutes: number) => `${minutes} min atrasado para começar`,
  slackLateInProduction: (minutes: number) => `${minutes} min atrás do previsto`,
  slackAhead: (minutes: number) => `folga de ${minutes} min`,
  howTitle: 'Como a fila é ordenada?',
  howBody: [
    'Cada pedido tem uma hora para estar pronto no balcão: a hora marcada (encomenda), a previsão que o cliente recebeu, ou a chegada + o tempo padrão da casa (mesa e balcão).',
    'Na entrega, descontamos o tempo de rua da moto: o pedido precisa ficar pronto antes para chegar na hora.',
    'Tirando o tempo do item mais demorado, sai a hora limite de começar. Quem tem essa hora mais cedo vem primeiro, seja mesa, retirada ou entrega.',
    '"Fazer agora" marca o próximo da fila e todo pedido que já passou ou está a 5 min da hora de começar.',
  ],
  waitingColumn: 'Próximos (na ordem sugerida)',
} as const
