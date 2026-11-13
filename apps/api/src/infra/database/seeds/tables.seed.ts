import { db } from '../connection'
import * as schema from '../schema'
import { requireItemAt } from './helpers/seed-helpers'

const TABLE_CAPACITIES = [2, 4, 4, 6, 2, 4, 8, 4, 2, 6]
const TABLE_STATUSES = ['available', 'available', 'occupied', 'available', 'available', 'available', 'reserved', 'available', 'occupied', 'available'] as const

function tableId(index: number): string {
  return `00000000-0000-0000-0005-${String(index).padStart(12, '0')}`
}

export async function seedTables(establishmentId: string): Promise<string[]> {
  const tables = TABLE_CAPACITIES.map((capacity, index) => ({
    id: tableId(index),
    establishmentId,
    number: index + 1,
    capacity,
    status: requireItemAt(TABLE_STATUSES, index),
  }))
  await db.insert(schema.restaurantTables).values(tables).onConflictDoNothing()
  return tables.map((table) => table.id)
}
