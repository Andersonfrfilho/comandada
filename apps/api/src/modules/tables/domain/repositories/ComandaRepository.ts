import type { Comanda } from '@/infra/database/schema'

export interface ComandaWithTable extends Comanda {
  tableNumber: number
  tableCapacity: number
}

export interface ComandaRepository {
  findById(id: string, establishmentId: string): Promise<ComandaWithTable | null>
  findOpenByTable(tableId: string, establishmentId: string): Promise<Comanda | null>
  findByCode(code: string, establishmentId: string): Promise<ComandaWithTable | null>
  findByCodePublic(code: string): Promise<ComandaWithTable | null>
  listByTable(tableId: string, establishmentId: string): Promise<Comanda[]>
  listOpenByEstablishment(establishmentId: string): Promise<ComandaWithTable[]>
  create(input: { establishmentId: string; tableId: string; code: string }): Promise<Comanda>
  confirm(id: string, input: { customerId?: string; customerName: string; customerPhone: string; customerDocument?: string }): Promise<Comanda>
  close(id: string, establishmentId: string, status: 'closed' | 'paid'): Promise<Comanda>
  isCodeActiveInEstablishment(code: string, establishmentId: string): Promise<boolean>
}
