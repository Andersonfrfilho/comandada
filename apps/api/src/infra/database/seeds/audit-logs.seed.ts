import { db } from '../connection'
import * as schema from '../schema'
import { daysAgo } from './helpers/seed-helpers'
import type { SeededOrder } from './orders.seed'

function auditLogId(index: number): string {
  return `00000000-0000-0000-000d-${String(index).padStart(12, '0')}`
}

type SeedAuditLogsParams = {
  establishmentId: string
  adminUserId: string
  caixaUserId: string
  orders: SeededOrder[]
}

export async function seedAuditLogs({ establishmentId, adminUserId, caixaUserId, orders }: SeedAuditLogsParams): Promise<void> {
  const orderLogs = orders.slice(0, 5).map((order, index) => ({
    id: auditLogId(index),
    establishmentId,
    userId: caixaUserId,
    action: 'order.status_changed',
    resourceType: 'order',
    resourceId: order.id,
    metadata: { toStatus: order.status },
    createdAt: daysAgo(order.daysAgo, 0),
  }))

  const systemLogs = [
    { action: 'auth.login', resourceType: 'session', userId: adminUserId, metadata: { success: true } },
    { action: 'auth.login', resourceType: 'session', userId: caixaUserId, metadata: { success: true } },
    { action: 'cash_register.opened', resourceType: 'cash_register', userId: caixaUserId, metadata: {} },
    { action: 'settings.updated', resourceType: 'settings', userId: adminUserId, metadata: { key: 'printer' } },
  ].map((log, index) => ({
    id: auditLogId(orderLogs.length + index),
    establishmentId,
    createdAt: daysAgo(index, 0),
    ...log,
  }))

  await db.insert(schema.auditLogs).values([...orderLogs, ...systemLogs]).onConflictDoNothing()
}
