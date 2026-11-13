import { daysAgo } from './seed-helpers'

/**
 * Movimento histórico do salão: cada sessão é uma comanda fechada com o pedido
 * de mesa que a acompanha. Vive aqui, e não dentro de cada seed, porque comanda
 * e pedido precisam nascer pareados — a receita da mesa é atribuída pela janela
 * de abertura e fechamento da comanda, então blueprint solto num arquivo e
 * blueprint solto no outro voltam a divergir na primeira edição.
 *
 * O volume existe para a taxa de ocupação sair de um dígito irrisório: seis
 * comandas em trinta dias davam 0,2%, e a tela ficava indemonstrável mesmo com
 * a conta correta.
 */

const HISTORY_DAYS = 30
const SESSIONS_PER_DAY = 20

// Minutos de operação por dia — o mesmo valor que `settings.seed` grava em
// `operating_hours`, que é o denominador da ocupação.
const OPERATING_MINUTES_PER_DAY = 720

// Folga no fim do expediente para nenhuma comanda fechar depois do horário
// (e, no dia 0, depois de agora).
const CLOSING_MARGIN_MINUTES = 120

const MINIMUM_DURATION_MINUTES = 45
const DURATION_SPREAD_MINUTES = 66

// O pedido entra pouco depois de a mesa sentar, sempre dentro da janela da
// comanda, já que a duração mínima é bem maior que isto.
const MINUTES_UNTIL_ORDER = 20

export type ServiceSession = {
  tableIndex: number
  openedAt: Date
  closedAt: Date
  orderReceivedAt: Date
}

function sessionDurationMinutes(day: number, session: number): number {
  return MINIMUM_DURATION_MINUTES + ((day * 13 + session * 29) % DURATION_SPREAD_MINUTES)
}

export function buildServiceHistory(tableCount: number): ServiceSession[] {
  if (tableCount === 0) return []

  const usableWindow = OPERATING_MINUTES_PER_DAY - CLOSING_MARGIN_MINUTES
  const minutesBetweenSessions = Math.floor(usableWindow / SESSIONS_PER_DAY)
  const sessions: ServiceSession[] = []

  for (let day = 0; day < HISTORY_DAYS; day += 1) {
    const dayReference = daysAgo(day)

    for (let session = 0; session < SESSIONS_PER_DAY; session += 1) {
      const startMinute = session * minutesBetweenSessions
      const minutesBeforeReference = OPERATING_MINUTES_PER_DAY - startMinute
      const openedAt = new Date(dayReference.getTime() - minutesBeforeReference * 60 * 1000)
      const durationMinutes = sessionDurationMinutes(day, session)

      sessions.push({
        tableIndex: (day * 3 + session) % tableCount,
        openedAt,
        closedAt: new Date(openedAt.getTime() + durationMinutes * 60 * 1000),
        orderReceivedAt: new Date(openedAt.getTime() + MINUTES_UNTIL_ORDER * 60 * 1000),
      })
    }
  }

  return sessions
}
