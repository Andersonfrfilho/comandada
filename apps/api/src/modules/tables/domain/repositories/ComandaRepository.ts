import type { Comanda } from '@/infra/database/schema'

export interface ComandaWithTable extends Comanda {
  tableNumber: number
  tableCapacity: number
}

export interface CreateComandaInput {
  establishmentId: string
  tableId: string
  code: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  guestsCount?: number | null
}

export interface ComandaConsumption {
  totalAmount: number
  ordersCount: number
}

export interface ComandaRepository {
  /** Quanto cada comanda aberta já consumiu (pedidos não cancelados), para o card da mesa. */
  consumptionOfOpen(establishmentId: string): Promise<Map<string, ComandaConsumption>>
  findById(id: string, establishmentId: string): Promise<ComandaWithTable | null>
  findOpenByTable(tableId: string, establishmentId: string): Promise<Comanda | null>
  findByCode(code: string, establishmentId: string): Promise<ComandaWithTable | null>
  findByCodePublic(code: string): Promise<ComandaWithTable | null>
  listByTable(tableId: string, establishmentId: string): Promise<Comanda[]>
  listOpenByEstablishment(establishmentId: string): Promise<ComandaWithTable[]>
  create(input: CreateComandaInput): Promise<Comanda>
  /** Muda quantas pessoas estão na comanda aberta; null quando a comanda não existe ou não está aberta. */
  updateGuestsCount(id: string, establishmentId: string, guestsCount: number | null): Promise<Comanda | null>
  /** Garçom pediu a conta (ou desfez: `null`). */
  setBillRequested(id: string, establishmentId: string, requestedAt: Date | null): Promise<Comanda | null>
  confirm(id: string, input: { customerId?: string; customerName: string; customerPhone: string; customerDocument?: string }): Promise<Comanda>
  close(id: string, establishmentId: string, status: 'closed' | 'paid'): Promise<Comanda>
  isCodeActiveInEstablishment(code: string, establishmentId: string): Promise<boolean>
}
