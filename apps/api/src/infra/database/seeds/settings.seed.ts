import { db } from '../connection'
import * as schema from '../schema'

function settingId(index: number): string {
  return `00000000-0000-0000-000c-${String(index).padStart(12, '0')}`
}

export async function seedSettings(establishmentId: string): Promise<void> {
  const settings = [
    { key: 'notifications', value: { newOrderSound: true, lowStockAlert: false } },
    { key: 'printer', value: { autoprint: true, copies: 1, paperWidth: 58 } },
    { key: 'kitchen_display', value: { columns: ['received', 'in_production', 'ready'] } },
    // Denominador da taxa de ocupação de mesas: 12h de salão aberto por dia.
    { key: 'operating_hours', value: { dailyMinutes: 720 } },
  ].map((setting, index) => ({
    id: settingId(index),
    establishmentId,
    ...setting,
  }))

  await db.insert(schema.settings).values(settings).onConflictDoNothing()
}
