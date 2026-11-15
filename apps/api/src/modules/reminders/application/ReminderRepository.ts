export interface ReorderCandidate {
  readonly customerId: string
  readonly name: string
  readonly whatsappNumber: string
  readonly lastOrderAt: Date
  /** Item de maior quantidade no último pedido; nulo se o pedido não tem item. */
  readonly topItem: string | null
  readonly previousMarketingAt: Date | null
}

export interface ReservationForReminder {
  readonly code: string
  readonly partySize: number
  readonly startsAt: Date
  readonly createdAt: Date
  readonly customerName: string
  readonly whatsappNumber: string
}

/** Leitura e marcação do que os lembretes precisam, separadas para o caso de uso ser testável. */
export interface ReminderRepository {
  listEstablishments(): Promise<Array<{ id: string; name: string }>>
  settingsFor(establishmentId: string): Promise<Record<string, unknown>>
  /**
   * Clientes que aceitaram novidades, cujo último pedido (não cancelado) caiu exatamente
   * `intervalDays` dias atrás no dia local, e que não receberam lembrete nos últimos `minGapDays` dias.
   */
  findReorderCandidates(params: {
    establishmentId: string
    intervalDays: number
    minGapDays: number
    now: Date
    limit: number
  }): Promise<ReorderCandidate[]>
  /** Marca o envio só se ninguém marcou antes (duas execuções juntas não mandam duas vezes). */
  claimReorderReminder(params: { customerId: string; minGapDays: number; now: Date }): Promise<boolean>
  /** Desfaz a marcação quando o envio falhou, para tentar de novo na próxima execução. */
  releaseReorderReminder(params: { customerId: string; previousMarketingAt: Date | null }): Promise<void>
  findReservationByBooking(params: { establishmentId: string; bookingId: string }): Promise<ReservationForReminder | null>
}
