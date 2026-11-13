import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { Customer } from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

interface FindOrCreateInput {
  establishmentId: string
  whatsappNumber: string
  name?: string
}

export class FindOrCreateCustomerUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: FindOrCreateInput): Promise<Customer> {
    const existing = await this.db.query.customers.findFirst({
      where: and(
        eq(schema.customers.establishmentId, input.establishmentId),
        eq(schema.customers.whatsappNumber, input.whatsappNumber)
      ),
    })

    if (existing) return existing

    const [created] = await this.db
      .insert(schema.customers)
      .values({
        establishmentId: input.establishmentId,
        whatsappNumber: input.whatsappNumber,
        name: input.name ?? 'Cliente WhatsApp',
      })
      .returning()

    return created!
  }
}
