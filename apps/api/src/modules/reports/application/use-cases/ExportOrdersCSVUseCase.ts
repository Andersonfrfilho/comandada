import { eq, and, gte, lte } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

interface ExportInput {
  establishmentId: string
  from: Date
  to: Date
}

// Sanitize a value for CSV: wrap in quotes, escape internal quotes with doubling.
// Prefixing with tab prevents formula injection in spreadsheet apps.
function csvCell(value: unknown): string {
  const str = String(value ?? '').replace(/"/g, '""')
  // Formula injection prevention: strip leading =, +, -, @
  const safe = str.replace(/^[=+\-@\t\r]/g, "'$&")
  return `"${safe}"`
}

export class ExportOrdersCSVUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: ExportInput): Promise<string> {
    const orders = await this.db.query.orders.findMany({
      where: and(
        eq(schema.orders.establishmentId, input.establishmentId),
        gte(schema.orders.receivedAt, input.from),
        lte(schema.orders.receivedAt, input.to)
      ),
      with: { items: true },
      orderBy: [schema.orders.receivedAt],
    })

    const header = ['ID', 'Canal', 'Tipo', 'Status', 'Total', 'Recebido em', 'Itens'].join(',')

    const rows = orders.map((order) => {
      const itemSummary = order.items.map((i) => `${i.quantity}x ${i.productName}`).join('; ')
      return [
        csvCell(order.id),
        csvCell(order.channel),
        csvCell(order.type),
        csvCell(order.status),
        csvCell(order.totalAmount),
        csvCell(order.receivedAt.toISOString()),
        csvCell(itemSummary),
      ].join(',')
    })

    return [header, ...rows].join('\n')
  }
}
