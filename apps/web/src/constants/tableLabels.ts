export type TableStatus = 'available' | 'occupied' | 'reserved'

export type ComandaStatus = 'open' | 'closed' | 'paid'

export interface Comanda {
  id: string
  code: string
  status: ComandaStatus
  customerName: string | null
  customerPhone: string | null
  openedAt: string
  closedAt: string | null
}

export interface TableWithComanda {
  id: string
  number: number
  capacity: number
  status: TableStatus
  positionX: number | null
  positionY: number | null
  createdAt: string
  comanda: Comanda | null
  comandas: Comanda[]
  groupId: string | null
}

export const COMANDA_STATUS_LABELS: Record<ComandaStatus, string> = {
  open: 'Aberta',
  closed: 'Encerrada',
  paid: 'Paga',
}

export const COMANDA_STATUS_COLORS: Record<ComandaStatus, string> = {
  open: 'bg-green-100 text-green-800 border-green-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  paid: 'bg-blue-100 text-blue-800 border-blue-200',
}

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Disponível',
  occupied: 'Ocupada',
  reserved: 'Reservada',
}

export const TABLE_STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-green-100 text-green-800 border-green-200',
  occupied: 'bg-red-100 text-red-800 border-red-200',
  reserved: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

export const TABLE_STATUS_CARD: Record<TableStatus, string> = {
  available: 'border-green-200 bg-green-50',
  occupied: 'border-red-200 bg-red-50',
  reserved: 'border-yellow-200 bg-yellow-50',
}
