import { eq, and, asc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { TableRepository, CreateTableInput, UpdateTableInput } from '../../domain/repositories/TableRepository'
import * as schema from '@/infra/database/schema'
import type { RestaurantTable } from '@/infra/database/schema'

export class DrizzleTableRepository implements TableRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listByEstablishment(establishmentId: string): Promise<RestaurantTable[]> {
    return this.db
      .select()
      .from(schema.restaurantTables)
      .where(eq(schema.restaurantTables.establishmentId, establishmentId))
      .orderBy(asc(schema.restaurantTables.number))
  }

  async findById(id: string, establishmentId: string): Promise<RestaurantTable | null> {
    const [table] = await this.db
      .select()
      .from(schema.restaurantTables)
      .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.establishmentId, establishmentId)))
    return table ?? null
  }

  async findByNumber(number: number, establishmentId: string): Promise<RestaurantTable | null> {
    const [table] = await this.db
      .select()
      .from(schema.restaurantTables)
      .where(and(eq(schema.restaurantTables.number, number), eq(schema.restaurantTables.establishmentId, establishmentId)))
    return table ?? null
  }

  async create(input: CreateTableInput): Promise<RestaurantTable> {
    const [table] = await this.db
      .insert(schema.restaurantTables)
      .values({
        establishmentId: input.establishmentId,
        number: input.number,
        capacity: input.capacity,
      })
      .returning()
    return table!
  }

  async update(id: string, establishmentId: string, input: UpdateTableInput): Promise<RestaurantTable> {
    const [table] = await this.db
      .update(schema.restaurantTables)
      .set({
        ...(input.number !== undefined && { number: input.number }),
        ...(input.capacity !== undefined && { capacity: input.capacity }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.establishmentId, establishmentId)))
      .returning()
    return table!
  }

  async updateStatus(id: string, establishmentId: string, status: 'available' | 'occupied' | 'reserved'): Promise<RestaurantTable> {
    const [table] = await this.db
      .update(schema.restaurantTables)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.establishmentId, establishmentId)))
      .returning()
    return table!
  }

  async updatePosition(id: string, establishmentId: string, positionX: number, positionY: number): Promise<RestaurantTable> {
    const [table] = await this.db
      .update(schema.restaurantTables)
      .set({ positionX, positionY, updatedAt: new Date() })
      .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.establishmentId, establishmentId)))
      .returning()
    return table!
  }

  async delete(id: string, establishmentId: string): Promise<void> {
    await this.db
      .delete(schema.restaurantTables)
      .where(and(eq(schema.restaurantTables.id, id), eq(schema.restaurantTables.establishmentId, establishmentId)))
  }
}
