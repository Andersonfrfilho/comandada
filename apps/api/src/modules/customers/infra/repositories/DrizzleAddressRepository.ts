import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type {
  AddressRepository,
  CreateAddressInput,
  UpdateAddressInput,
} from '../../domain/repositories/AddressRepository'
import * as schema from '@/infra/database/schema'
import type { Address } from '@/infra/database/schema'

export class DrizzleAddressRepository implements AddressRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listByCustomer(customerId: string): Promise<Address[]> {
    return this.db
      .select()
      .from(schema.addresses)
      .where(eq(schema.addresses.customerId, customerId))
      .orderBy(schema.addresses.createdAt)
  }

  async findById(id: string, customerId: string): Promise<Address | null> {
    const [address] = await this.db
      .select()
      .from(schema.addresses)
      .where(and(
        eq(schema.addresses.id, id),
        eq(schema.addresses.customerId, customerId)
      ))
    return address ?? null
  }

  async create(customerId: string, input: CreateAddressInput): Promise<Address> {
    const insertData: typeof schema.addresses.$inferInsert = {
      customerId,
      street: input.street,
      number: input.number,
      complement: input.complement ?? null,
      neighborhood: input.neighborhood,
      city: input.city,
      state: input.state,
      zip: input.zip ?? null,
      label: input.label ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    }

    const [address] = await this.db
      .insert(schema.addresses)
      .values(insertData)
      .returning()
    return address!
  }

  async update(id: string, customerId: string, input: UpdateAddressInput): Promise<Address> {
    const [address] = await this.db
      .update(schema.addresses)
      .set({
        ...(input.street !== undefined && { street: input.street }),
        ...(input.number !== undefined && { number: input.number }),
        ...(input.complement !== undefined && { complement: input.complement }),
        ...(input.neighborhood !== undefined && { neighborhood: input.neighborhood }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.state !== undefined && { state: input.state }),
        ...(input.zip !== undefined && { zip: input.zip }),
        ...(input.label !== undefined && { label: input.label }),
        ...(input.lat !== undefined && { lat: input.lat }),
        ...(input.lng !== undefined && { lng: input.lng }),
      })
      .where(and(
        eq(schema.addresses.id, id),
        eq(schema.addresses.customerId, customerId)
      ))
      .returning()
    return address!
  }

  async delete(id: string, customerId: string): Promise<void> {
    await this.db
      .delete(schema.addresses)
      .where(and(
        eq(schema.addresses.id, id),
        eq(schema.addresses.customerId, customerId)
      ))
  }

  async setDefault(id: string, customerId: string): Promise<Address> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.addresses)
        .set({ isDefault: false })
        .where(and(
          eq(schema.addresses.customerId, customerId),
          eq(schema.addresses.isDefault, true)
        ))
      await tx
        .update(schema.addresses)
        .set({ isDefault: true })
        .where(eq(schema.addresses.id, id))
    })

    const [address] = await this.db
      .select()
      .from(schema.addresses)
      .where(eq(schema.addresses.id, id))
    return address!
  }
}
