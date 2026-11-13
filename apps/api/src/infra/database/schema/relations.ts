import { relations } from 'drizzle-orm'
import { establishments } from './establishments'
import { roles } from './roles'
import { permissions } from './permissions'
import { users } from './users'
import { customers } from './customers'
import { addresses } from './addresses'
import { catalogs } from './catalogs'
import { products } from './products'
import { productPriceHistory } from './product-price-history'
import { productAffinities } from './product-affinities'
import { productComponents } from './product-components'
import { restaurantTables } from './tables'
import { tableGroups } from './table-groups'
import { comandas } from './comandas'
import { orders } from './orders'
import { orderItems } from './order-items'
import { orderPayments } from './order-payments'
import { orderStatusLogs } from './order-status-logs'
import { fiscalDocuments } from './fiscal-documents'
import { deliveries } from './deliveries'
import { cashRegisters } from './cash-registers'
import { cashMovements } from './cash-movements'
import { settings } from './settings'
import { auditLogs } from './audit-logs'
import { ingredients } from './ingredients'
import { productIngredients } from './product-ingredients'
import { stockBatches } from './stock-batches'
import { stockMovements } from './stock-movements'
import { expenses } from './expenses'
import { sections } from './sections'
import { deliveryFeeRules } from './delivery-fee-rules'
import { deliveryFeeZones } from './delivery-fee-zones'

export const establishmentsRelations = relations(establishments, ({ many }) => ({
  roles: many(roles),
  users: many(users),
  customers: many(customers),
  catalogs: many(catalogs),
  products: many(products),
  restaurantTables: many(restaurantTables),
  comandas: many(comandas),
  orders: many(orders),
  cashRegisters: many(cashRegisters),
  settings: many(settings),
  auditLogs: many(auditLogs),
  ingredients: many(ingredients),
  stockBatches: many(stockBatches),
  stockMovements: many(stockMovements),
  deliveryFeeRules: many(deliveryFeeRules),
}))

export const rolesRelations = relations(roles, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [roles.establishmentId],
    references: [establishments.id],
  }),
  permissions: many(permissions),
  users: many(users),
}))

export const permissionsRelations = relations(permissions, ({ one }) => ({
  role: one(roles, { fields: [permissions.roleId], references: [roles.id] }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [users.establishmentId],
    references: [establishments.id],
  }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  cashRegisters: many(cashRegisters),
  deliveries: many(deliveries),
  auditLogs: many(auditLogs),
}))

export const customersRelations = relations(customers, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [customers.establishmentId],
    references: [establishments.id],
  }),
  addresses: many(addresses),
  orders: many(orders),
}))

export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, {
    fields: [addresses.customerId],
    references: [customers.id],
  }),
}))

export const catalogsRelations = relations(catalogs, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [catalogs.establishmentId],
    references: [establishments.id],
  }),
  products: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [products.establishmentId],
    references: [establishments.id],
  }),
  catalog: one(catalogs, {
    fields: [products.catalogId],
    references: [catalogs.id],
  }),
  section: one(sections, {
    fields: [products.sectionId],
    references: [sections.id],
  }),
  orderItems: many(orderItems),
  productIngredients: many(productIngredients),
  priceHistory: many(productPriceHistory),
}))

export const productPriceHistoryRelations = relations(productPriceHistory, ({ one }) => ({
  establishment: one(establishments, {
    fields: [productPriceHistory.establishmentId],
    references: [establishments.id],
  }),
  product: one(products, {
    fields: [productPriceHistory.productId],
    references: [products.id],
  }),
  user: one(users, {
    fields: [productPriceHistory.userId],
    references: [users.id],
  }),
}))

export const productAffinitiesRelations = relations(productAffinities, ({ one }) => ({
  establishment: one(establishments, {
    fields: [productAffinities.establishmentId],
    references: [establishments.id],
  }),
  product: one(products, {
    fields: [productAffinities.productId],
    references: [products.id],
  }),
  suggestedProduct: one(products, {
    fields: [productAffinities.suggestedProductId],
    references: [products.id],
  }),
}))

export const productComponentsRelations = relations(productComponents, ({ one }) => ({
  kit: one(products, {
    fields: [productComponents.kitProductId],
    references: [products.id],
  }),
  component: one(products, {
    fields: [productComponents.componentProductId],
    references: [products.id],
  }),
}))

export const restaurantTablesRelations = relations(restaurantTables, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [restaurantTables.establishmentId],
    references: [establishments.id],
  }),
  group: one(tableGroups, {
    fields: [restaurantTables.groupId],
    references: [tableGroups.id],
  }),
  orders: many(orders),
  comandas: many(comandas),
}))

export const tableGroupsRelations = relations(tableGroups, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [tableGroups.establishmentId],
    references: [establishments.id],
  }),
  tables: many(restaurantTables),
}))

export const comandasRelations = relations(comandas, ({ one }) => ({
  establishment: one(establishments, {
    fields: [comandas.establishmentId],
    references: [establishments.id],
  }),
  table: one(restaurantTables, {
    fields: [comandas.tableId],
    references: [restaurantTables.id],
  }),
  customer: one(customers, {
    fields: [comandas.customerId],
    references: [customers.id],
  }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [orders.establishmentId],
    references: [establishments.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  table: one(restaurantTables, {
    fields: [orders.tableId],
    references: [restaurantTables.id],
  }),
  items: many(orderItems),
  payments: many(orderPayments),
  delivery: many(deliveries),
  cashMovements: many(cashMovements),
  statusLogs: many(orderStatusLogs),
  fiscalDocument: one(fiscalDocuments, {
    fields: [orders.id],
    references: [fiscalDocuments.orderId],
  }),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}))

export const orderStatusLogsRelations = relations(orderStatusLogs, ({ one }) => ({
  order: one(orders, { fields: [orderStatusLogs.orderId], references: [orders.id] }),
}))

export const fiscalDocumentsRelations = relations(fiscalDocuments, ({ one }) => ({
  order: one(orders, { fields: [fiscalDocuments.orderId], references: [orders.id] }),
}))

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, { fields: [orderPayments.orderId], references: [orders.id] }),
}))

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  order: one(orders, { fields: [deliveries.orderId], references: [orders.id] }),
  establishment: one(establishments, {
    fields: [deliveries.establishmentId],
    references: [establishments.id],
  }),
  deliverer: one(users, {
    fields: [deliveries.delivererId],
    references: [users.id],
  }),
}))

export const cashRegistersRelations = relations(cashRegisters, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [cashRegisters.establishmentId],
    references: [establishments.id],
  }),
  user: one(users, { fields: [cashRegisters.userId], references: [users.id] }),
  movements: many(cashMovements),
}))

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  cashRegister: one(cashRegisters, {
    fields: [cashMovements.cashRegisterId],
    references: [cashRegisters.id],
  }),
  order: one(orders, { fields: [cashMovements.orderId], references: [orders.id] }),
}))

export const settingsRelations = relations(settings, ({ one }) => ({
  establishment: one(establishments, {
    fields: [settings.establishmentId],
    references: [establishments.id],
  }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  establishment: one(establishments, {
    fields: [auditLogs.establishmentId],
    references: [establishments.id],
  }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}))

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [ingredients.establishmentId],
    references: [establishments.id],
  }),
  section: one(sections, {
    fields: [ingredients.sectionId],
    references: [sections.id],
  }),
  productIngredients: many(productIngredients),
  stockBatches: many(stockBatches),
  stockMovements: many(stockMovements),
}))

export const productIngredientsRelations = relations(productIngredients, ({ one }) => ({
  product: one(products, {
    fields: [productIngredients.productId],
    references: [products.id],
  }),
  ingredient: one(ingredients, {
    fields: [productIngredients.ingredientId],
    references: [ingredients.id],
  }),
}))

export const stockBatchesRelations = relations(stockBatches, ({ one, many }) => ({
  ingredient: one(ingredients, {
    fields: [stockBatches.ingredientId],
    references: [ingredients.id],
  }),
  stockMovements: many(stockMovements),
}))

export const deliveryFeeRulesRelations = relations(deliveryFeeRules, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [deliveryFeeRules.establishmentId],
    references: [establishments.id],
  }),
  zones: many(deliveryFeeZones),
}))

export const expensesRelations = relations(expenses, ({ one }) => ({
  establishment: one(establishments, {
    fields: [expenses.establishmentId],
    references: [establishments.id],
  }),
}))

export const deliveryFeeZonesRelations = relations(deliveryFeeZones, ({ one }) => ({
  rule: one(deliveryFeeRules, {
    fields: [deliveryFeeZones.deliveryFeeRuleId],
    references: [deliveryFeeRules.id],
  }),
  establishment: one(establishments, {
    fields: [deliveryFeeZones.establishmentId],
    references: [establishments.id],
  }),
}))

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [stockMovements.ingredientId],
    references: [ingredients.id],
  }),
  batch: one(stockBatches, {
    fields: [stockMovements.batchId],
    references: [stockBatches.id],
  }),
  order: one(orders, {
    fields: [stockMovements.orderId],
    references: [orders.id],
  }),
  user: one(users, {
    fields: [stockMovements.userId],
    references: [users.id],
  }),
}))
