import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError, NotFoundError } from '@/shared/errors/AppError'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

const CATEGORIES = [
  'aluguel', 'energia', 'agua', 'internet', 'telefone',
  'salarios', 'impostos', 'marketing', 'manutencao', 'outros',
] as const

const RECURRENCES = ['monthly', 'bimonthly', 'yearly'] as const

const createAccountSchema = z.object({
  description: z.string().min(1).max(255),
  category: z.enum(CATEGORIES).default('outros'),
  amount: z.number().positive(),
  dueDay: z.number().int().min(1).max(31),
  recurrence: z.enum(RECURRENCES).default('monthly'),
  notes: z.string().max(1000).optional(),
})

const updateAccountSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  category: z.enum(CATEGORIES).optional(),
  amount: z.number().positive().optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  recurrence: z.enum(RECURRENCES).optional(),
  notes: z.string().max(1000).optional().nullable(),
})

export class MonthlyAccountController {
  constructor(private readonly db: Database) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const { month, status } = request.query

    let accounts = await this.db
      .select()
      .from(schema.monthlyAccounts)
      .where(
        and(
          eq(schema.monthlyAccounts.establishmentId, establishmentId)
        )
      )

    if (month) {
      const monthNum = parseInt(month)
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        accounts = accounts.filter((account) => account.dueDay >= 1 && account.dueDay <= 31)
      }
    }

    if (status && (status === 'pending' || status === 'paid')) {
      accounts = accounts.filter((account) => account.status === status)
    }

    accounts.sort((a, b) => a.dueDay - b.dueDay)

    const totalPending = accounts
      .filter((a) => a.status === 'pending')
      .reduce((sum, a) => sum + Number(a.amount), 0)

    const totalPaid = accounts
      .filter((a) => a.status === 'paid')
      .reduce((sum, a) => sum + Number(a.amount), 0)

    response.json({
      accounts,
      totalPending: totalPending.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
    })
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = createAccountSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)

    const [account] = await this.db
      .insert(schema.monthlyAccounts)
      .values({
        establishmentId: request.user.establishmentId,
        description: parsed.data.description,
        category: parsed.data.category,
        amount: parsed.data.amount.toString(),
        dueDay: parsed.data.dueDay,
        recurrence: parsed.data.recurrence,
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      })
      .returning()

    response.json(account, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']
    if (!id) throw new ValidationError('ID is required')

    const parsed = updateAccountSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)

    const existing = await this.db.query.monthlyAccounts.findFirst({
      where: and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Monthly account')

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category
    if (parsed.data.amount !== undefined) updateData.amount = parsed.data.amount.toString()
    if (parsed.data.dueDay !== undefined) updateData.dueDay = parsed.data.dueDay
    if (parsed.data.recurrence !== undefined) updateData.recurrence = parsed.data.recurrence
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes

    const [updated] = await this.db
      .update(schema.monthlyAccounts)
      .set(updateData)
      .where(and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ))
      .returning()

    response.json(updated)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']
    if (!id) throw new ValidationError('ID is required')

    const existing = await this.db.query.monthlyAccounts.findFirst({
      where: and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Monthly account')

    await this.db
      .delete(schema.monthlyAccounts)
      .where(and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ))

    response.json({ deleted: true })
  }

  markAsPaid: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']
    if (!id) throw new ValidationError('ID is required')

    const existing = await this.db.query.monthlyAccounts.findFirst({
      where: and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Monthly account')

    const [updated] = await this.db
      .update(schema.monthlyAccounts)
      .set({
        status: 'paid',
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ))
      .returning()

    response.json(updated)
  }

  markAsPending: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']
    if (!id) throw new ValidationError('ID is required')

    const existing = await this.db.query.monthlyAccounts.findFirst({
      where: and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Monthly account')

    const [updated] = await this.db
      .update(schema.monthlyAccounts)
      .set({
        status: 'pending',
        paidAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.monthlyAccounts.id, id),
        eq(schema.monthlyAccounts.establishmentId, establishmentId)
      ))
      .returning()

    response.json(updated)
  }
}
