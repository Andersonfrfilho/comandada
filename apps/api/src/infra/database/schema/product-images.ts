import { pgTable, uuid, varchar, timestamp, customType } from 'drizzle-orm/pg-core'
import { products } from './products'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

/**
 * Foto do produto já reduzida (WebP). Fica no banco porque o disco do container some a cada deploy;
 * a linha do produto guarda só a versão (`products.image_version`), então listar o cardápio não lê os bytes.
 */
export const productImages = pgTable('product_images', {
  productId: uuid('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  content: bytea('content').notNull(),
  contentType: varchar('content_type', { length: 40 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ProductImage = typeof productImages.$inferSelect
