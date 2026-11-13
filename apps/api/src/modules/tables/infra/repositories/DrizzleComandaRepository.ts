import { eq, and, desc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { ComandaRepository, ComandaWithTable } from '../../domain/repositories/ComandaRepository'
import * as schema from '@/infra/database/schema'
import type { Comanda } from '@/infra/database/schema'

export class DrizzleComandaRepository implements ComandaRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private async joinTable(comanda: Comanda): Promise<ComandaWithTable> {
    const [table] = await this.db
      .select({ number: schema.restaurantTables.number, capacity: schema.restaurantTables.capacity })
      .from(schema.restaurantTables)
      .where(eq(schema.restaurantTables.id, comanda.tableId))
    return {
      ...comanda,
      tableNumber: table?.number ?? 0,
      tableCapacity: table?.capacity ?? 0,
    }
  }

  async findById(id: string, establishmentId: string): Promise<ComandaWithTable | null> {
    const [comanda] = await this.db
      .select()
      .from(schema.comandas)
      .where(and(eq(schema.comandas.id, id), eq(schema.comandas.establishmentId, establishmentId)))
    if (!comanda) return null
    return this.joinTable(comanda)
  }

  async findOpenByTable(tableId: string, establishmentId: string): Promise<Comanda | null> {
    const [comanda] = await this.db
      .select()
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.tableId, tableId),
          eq(schema.comandas.establishmentId, establishmentId),
          eq(schema.comandas.status, 'open')
        )
      )
    return comanda ?? null
  }

  async findByCode(code: string, establishmentId: string): Promise<ComandaWithTable | null> {
    const [comanda] = await this.db
      .select()
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.code, code.toUpperCase()),
          eq(schema.comandas.establishmentId, establishmentId),
          eq(schema.comandas.status, 'open')
        )
      )
    if (!comanda) return null
    return this.joinTable(comanda)
  }

  async findByCodePublic(code: string): Promise<ComandaWithTable | null> {
    const [comanda] = await this.db
      .select()
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.code, code.toUpperCase()),
          eq(schema.comandas.status, 'open')
        )
      )
    if (!comanda) return null
    return this.joinTable(comanda)
  }

  async listByTable(tableId: string, establishmentId: string): Promise<Comanda[]> {
    return this.db
      .select()
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.tableId, tableId),
          eq(schema.comandas.establishmentId, establishmentId)
        )
      )
      .orderBy(desc(schema.comandas.openedAt))
  }

  async listOpenByEstablishment(establishmentId: string): Promise<ComandaWithTable[]> {
    const rows = await this.db
      .select()
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.establishmentId, establishmentId),
          eq(schema.comandas.status, 'open')
        )
      )
    return Promise.all(rows.map((r) => this.joinTable(r)))
  }

  async create(input: { establishmentId: string; tableId: string; code: string }): Promise<Comanda> {
    const [comanda] = await this.db
      .insert(schema.comandas)
      .values({
        establishmentId: input.establishmentId,
        tableId: input.tableId,
        code: input.code.toUpperCase(),
      })
      .returning()
    return comanda!
  }

  async confirm(
    id: string,
    input: { customerId?: string; customerName: string; customerPhone: string; customerDocument?: string }
  ): Promise<Comanda> {
    const [comanda] = await this.db
      .update(schema.comandas)
      .set({
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerDocument: input.customerDocument ?? null,
      })
      .where(eq(schema.comandas.id, id))
      .returning()
    return comanda!
  }

  async close(id: string, establishmentId: string, status: 'closed' | 'paid'): Promise<Comanda> {
    const [comanda] = await this.db
      .update(schema.comandas)
      .set({ status, closedAt: new Date() })
      .where(and(eq(schema.comandas.id, id), eq(schema.comandas.establishmentId, establishmentId)))
      .returning()
    return comanda!
  }

  async isCodeActiveInEstablishment(code: string, establishmentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.comandas.id })
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.code, code.toUpperCase()),
          eq(schema.comandas.establishmentId, establishmentId),
          eq(schema.comandas.status, 'open')
        )
      )
    return !!row
  }
}
