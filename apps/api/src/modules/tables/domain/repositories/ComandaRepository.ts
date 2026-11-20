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
  guestsCount?: number
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
  /** Garçom pediu a conta (ou desfez: `null`). */
  setBillRequested(id: string, establishmentId: string, requestedAt: Date | null): Promise<Comanda | null>
  confirm(id: string, input: { customerId?: string; customerName: string; customerPhone: string; customerDocument?: string }): Promise<Comanda>
  close(id: string, establishmentId: string, status: 'closed' | 'paid'): Promise<Comanda>
  isCodeActiveInEstablishment(code: string, establishmentId: string): Promise<boolean>
}
