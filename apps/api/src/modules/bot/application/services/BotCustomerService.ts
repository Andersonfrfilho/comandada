import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export interface FindOrCreateCustomerParams {
  establishmentId: string
  whatsappNumber: string
  name?: string | undefined
}

export class BotCustomerService {
  constructor(private readonly db: Database) {}

  async findByNumber(params: { establishmentId: string; whatsappNumber: string }): Promise<schema.Customer | undefined> {
    return this.db.query.customers.findFirst({
      where: and(
        eq(schema.customers.establishmentId, params.establishmentId),
        eq(schema.customers.whatsappNumber, params.whatsappNumber)
      ),
    })
  }

  // The customer row needs a name; until the bot learns it, the number stands in for it.
  async findOrCreate(params: FindOrCreateCustomerParams): Promise<schema.Customer> {
    const existing = await this.findByNumber(params)
    if (existing) {
      if (params.name && existing.name !== params.name) return this.rename(existing.id, params.name)
      return existing
    }
    const [created] = await this.db
      .insert(schema.customers)
      .values({
        establishmentId: params.establishmentId,
        whatsappNumber: params.whatsappNumber,
        phone: params.whatsappNumber,
        name: params.name ?? params.whatsappNumber,
      })
      .returning()
    if (!created) throw new Error('Failed to create customer')
    return created
  }

  private async rename(customerId: string, name: string): Promise<schema.Customer> {
    const [updated] = await this.db
      .update(schema.customers)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.customers.id, customerId))
      .returning()
    if (!updated) throw new Error('Failed to rename customer')
    return updated
  }
}
