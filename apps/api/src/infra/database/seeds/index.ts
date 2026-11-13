import { seedFaker } from './helpers/seed-helpers'
import { seedEstablishment } from './establishment.seed'
import { seedRolesAndPermissions } from './roles-permissions.seed'
import { seedUsers } from './users.seed'
import { seedCatalog } from './catalog.seed'
import { seedCustomers } from './customers.seed'
import { seedTables } from './tables.seed'
import { seedComandas } from './comandas.seed'
import { seedOrders } from './orders.seed'
import { seedStockConsumption } from './stock-consumption.seed'
import { seedDeliveries } from './deliveries.seed'
import { seedCashier } from './cashier.seed'
import { seedSettings } from './settings.seed'
import { seedAuditLogs } from './audit-logs.seed'
import { seedFiscal } from './fiscal.seed'
import { seedConversations } from './conversations.seed'
import { seedConversationDocuments } from './conversation-documents.seed'

async function seed(): Promise<void> {
  console.log('[Seed] Starting...')
  seedFaker()

  const establishmentId = await seedEstablishment()
  await seedRolesAndPermissions(establishmentId)
  const userIds = await seedUsers(establishmentId)
  await seedCatalog(establishmentId)

  const customerIds = await seedCustomers(establishmentId)
  const tableIds = await seedTables(establishmentId)
  await seedComandas({ establishmentId, tableIds, customerIds })

  const orders = await seedOrders({ establishmentId, customerIds, tableIds })
  await seedStockConsumption({ establishmentId })
  await seedDeliveries({ establishmentId, delivererUserId: userIds.entregador, orders })
  await seedCashier({ establishmentId, caixaUserId: userIds.caixa, orders })
  await seedFiscal({ establishmentId, orders })

  await seedConversations(establishmentId, userIds.atendente)
  await seedConversationDocuments(establishmentId)

  await seedSettings(establishmentId)
  await seedAuditLogs({ establishmentId, adminUserId: userIds.admin, caixaUserId: userIds.caixa, orders })

  console.log('[Seed] Done.')
  process.exit(0)
}

seed().catch((error) => {
  console.error('[Seed] Error:', error)
  process.exit(1)
})
