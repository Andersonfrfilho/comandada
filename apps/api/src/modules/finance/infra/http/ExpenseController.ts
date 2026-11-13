import { eq, and, gte, lte, sql, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import type { UploadFileUseCase } from '@/modules/uploads/application/UploadFileUseCase'
import { UnauthorizedError, ValidationError, NotFoundError } from '@/shared/errors/AppError'
import { parseMultipart } from '@/shared/utils/parseMultipart'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

const EXPENSE_CATEGORIES = [
  'ingredientes', 'embalagens', 'limpeza', 'equipamentos',
  'marketing', 'transporte', 'impostos', 'taxas', 'outros',
] as const

const ALLOWED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

const MAX_RECEIPT_SIZE = 10 * 1024 * 1024

const createExpenseSchema = z.object({
  description: z.string().min(1).max(255),
  category: z.enum(EXPENSE_CATEGORIES).default('outros'),
  amount: z.number().positive(),
  expenseDate: z.string().optional(),
  supplier: z.string().max(255).optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

const updateExpenseSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: z.number().positive().optional(),
  expenseDate: z.string().optional(),
  supplier: z.string().max(255).optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

export class ExpenseController {
  constructor(
    private readonly db: Database,
    private readonly uploadFileUseCase: UploadFileUseCase,
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const { month, year, category } = request.query

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.expenses.establishmentId, establishmentId),
    ]

    if (month && year) {
      const monthNum = parseInt(month)
      const yearNum = parseInt(year)
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 && !isNaN(yearNum)) {
        const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`
        const endMonth = monthNum === 12 ? 1 : monthNum + 1
        const endYear = monthNum === 12 ? yearNum + 1 : yearNum
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
        conditions.push(gte(schema.expenses.expenseDate, startDate))
        conditions.push(lte(schema.expenses.expenseDate, endDate))
      }
    }

    if (category && (EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      conditions.push(eq(schema.expenses.category, category))
    }

    const result = await this.db
      .select()
      .from(schema.expenses)
      .where(and(...conditions))
      .orderBy(desc(schema.expenses.expenseDate))

    const totalAmount = result.reduce((sum, e) => sum + Number(e.amount), 0)

    response.json({
      expenses: result,
      totalAmount: totalAmount.toFixed(2),
    })
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = createExpenseSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)

    const expenseDateValue = parsed.data.expenseDate ?? new Date().toISOString().split('T')[0]!
    const values: schema.NewExpense = {
      establishmentId: request.user.establishmentId,
      description: parsed.data.description,
      category: parsed.data.category,
      amount: parsed.data.amount.toString(),
      expenseDate: expenseDateValue,
    }
    if (parsed.data.supplier !== undefined) values.supplier = parsed.data.supplier
    if (parsed.data.receiptUrl !== undefined) values.receiptUrl = parsed.data.receiptUrl
    if (parsed.data.notes !== undefined) values.notes = parsed.data.notes

    const [expense] = await this.db
      .insert(schema.expenses)
      .values(values)
      .returning()

    response.json(expense, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']
    if (!id) throw new ValidationError('ID is required')

    const parsed = updateExpenseSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)

    const existing = await this.db.query.expenses.findFirst({
      where: and(
        eq(schema.expenses.id, id),
        eq(schema.expenses.establishmentId, establishmentId),
      ),
    })
    if (!existing) throw new NotFoundError('Expense')

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category
    if (parsed.data.amount !== undefined) updateData.amount = parsed.data.amount.toString()
    if (parsed.data.expenseDate !== undefined) updateData.expenseDate = parsed.data.expenseDate
    if (parsed.data.supplier !== undefined) updateData.supplier = parsed.data.supplier
    if (parsed.data.receiptUrl !== undefined) updateData.receiptUrl = parsed.data.receiptUrl
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes

    const [updated] = await this.db
      .update(schema.expenses)
      .set(updateData)
      .where(and(
        eq(schema.expenses.id, id),
        eq(schema.expenses.establishmentId, establishmentId),
      ))
      .returning()

    response.json(updated)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']
    if (!id) throw new ValidationError('ID is required')

    const existing = await this.db.query.expenses.findFirst({
      where: and(
        eq(schema.expenses.id, id),
        eq(schema.expenses.establishmentId, establishmentId),
      ),
    })
    if (!existing) throw new NotFoundError('Expense')

    await this.db
      .delete(schema.expenses)
      .where(and(
        eq(schema.expenses.id, id),
        eq(schema.expenses.establishmentId, establishmentId),
      ))

    response.json({ deleted: true })
  }

  uploadReceipt: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']
    if (!id) throw new ValidationError('ID is required')

    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ValidationError('Content-Type must be multipart/form-data')
    }

    const existing = await this.db.query.expenses.findFirst({
      where: and(
        eq(schema.expenses.id, id),
        eq(schema.expenses.establishmentId, establishmentId),
      ),
    })
    if (!existing) throw new NotFoundError('Expense')

    const parsed = parseMultipart(request.rawBody, contentType)
    const uploadedFile = parsed.files[0]
    if (!uploadedFile) {
      throw new ValidationError('No file provided in field "file"')
    }

    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(uploadedFile.contentType)) {
      throw new ValidationError(
        `Unsupported file type: ${uploadedFile.contentType}. Allowed: ${ALLOWED_RECEIPT_MIME_TYPES.join(', ')}`
      )
    }

    if (uploadedFile.buffer.length > MAX_RECEIPT_SIZE) {
      throw new ValidationError('File size exceeds 10 MB limit')
    }

    const result = await this.uploadFileUseCase.execute({
      buffer: uploadedFile.buffer,
      originalName: uploadedFile.fileName,
      contentType: uploadedFile.contentType,
    })

    const [updated] = await this.db
      .update(schema.expenses)
      .set({
        receiptUrl: result.url,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.expenses.id, id),
        eq(schema.expenses.establishmentId, establishmentId),
      ))
      .returning()

    response.json(updated)
  }

  private formatDateSlug(date: Date): string {
    return date.toISOString().split('T')[0]!
  }

  getOverview: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const monthsRaw = request.query['months'] ?? '6'
    const months = parseInt(monthsRaw)
    const periodMonths = !isNaN(months) && months > 0 ? months : 6

    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const currentMonthDateSlug = this.formatDateSlug(currentMonthStart)
    const currentMonthEndSlug = this.formatDateSlug(currentMonthEnd)

    // Current month revenue from completed orders
    const completedOrders = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.orders.totalAmount}), '0')` })
      .from(schema.orders)
      .where(and(
        eq(schema.orders.establishmentId, establishmentId),
        eq(schema.orders.status, 'completed'),
        gte(schema.orders.completedAt, currentMonthStart),
        lte(schema.orders.completedAt, currentMonthEnd),
      ))

    // Current month cash register payments
    const cashPayments = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.cashMovements.amount}), '0')` })
      .from(schema.cashMovements)
      .innerJoin(schema.cashRegisters, eq(schema.cashMovements.cashRegisterId, schema.cashRegisters.id))
      .where(and(
        eq(schema.cashRegisters.establishmentId, establishmentId),
        eq(schema.cashMovements.type, 'payment'),
        gte(schema.cashMovements.createdAt, currentMonthStart),
        lte(schema.cashMovements.createdAt, currentMonthEnd),
      ))

    const monthlyRevenue = Number(completedOrders[0]?.total ?? '0') + Number(cashPayments[0]?.total ?? '0')

    // Current month expenses
    const monthExpenses = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.expenses.amount}), '0')` })
      .from(schema.expenses)
      .where(and(
        eq(schema.expenses.establishmentId, establishmentId),
        gte(schema.expenses.expenseDate, currentMonthDateSlug),
        lte(schema.expenses.expenseDate, currentMonthEndSlug),
      ))

    // Total monthly accounts (pending)
    const monthlyAccountsTotal = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.monthlyAccounts.amount}), '0')` })
      .from(schema.monthlyAccounts)
      .where(and(
        eq(schema.monthlyAccounts.establishmentId, establishmentId),
        eq(schema.monthlyAccounts.status, 'pending'),
      ))

    const totalMonthlyAccounts = Number(monthlyAccountsTotal[0]?.total ?? '0')

    // Stock movement costs for current month
    const stockCosts = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.stockMovements.quantity} * ${schema.stockBatches.costPerUnit}), '0')` })
      .from(schema.stockMovements)
      .innerJoin(schema.stockBatches, eq(schema.stockMovements.batchId, schema.stockBatches.id))
      .where(and(
        eq(schema.stockMovements.establishmentId, establishmentId),
        gte(schema.stockMovements.createdAt, currentMonthStart),
        lte(schema.stockMovements.createdAt, currentMonthEnd),
      ))

    const totalStockCosts = Number(stockCosts[0]?.total ?? '0')
    const totalExpenses = Number(monthExpenses[0]?.total ?? '0')

    const totalCosts = totalExpenses + totalMonthlyAccounts + totalStockCosts
    const margin = monthlyRevenue > 0 ? ((monthlyRevenue - totalCosts) / monthlyRevenue) * 100 : 0

    const status: 'healthy' | 'warning' | 'critical' =
      margin > 20 ? 'healthy' : margin >= 10 ? 'warning' : 'critical'

    const variableCostRatio = monthlyRevenue > 0
      ? totalStockCosts / monthlyRevenue
      : 0.6

    const breakEvenPoint = variableCostRatio < 1 && totalMonthlyAccounts > 0
      ? totalMonthlyAccounts / (1 - variableCostRatio)
      : totalMonthlyAccounts

    // Monthly evolution for last N months
    const monthlyEvolution: Array<{
      month: string
      revenue: number
      costs: number
      margin: number
    }> = []

    for (let i = 0; i < periodMonths; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthLabel = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
      const monthDateSlug = this.formatDateSlug(monthDate)
      const nextMonthDateSlug = this.formatDateSlug(nextMonthDate)

      const monthOrders = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.orders.totalAmount}), '0')` })
        .from(schema.orders)
        .where(and(
          eq(schema.orders.establishmentId, establishmentId),
          eq(schema.orders.status, 'completed'),
          gte(schema.orders.completedAt, monthDate),
          lte(schema.orders.completedAt, nextMonthDate),
        ))

      const monthCash = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.cashMovements.amount}), '0')` })
        .from(schema.cashMovements)
        .innerJoin(schema.cashRegisters, eq(schema.cashMovements.cashRegisterId, schema.cashRegisters.id))
        .where(and(
          eq(schema.cashRegisters.establishmentId, establishmentId),
          eq(schema.cashMovements.type, 'payment'),
          gte(schema.cashMovements.createdAt, monthDate),
          lte(schema.cashMovements.createdAt, nextMonthDate),
        ))

      const monthExp = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.expenses.amount}), '0')` })
        .from(schema.expenses)
        .where(and(
          eq(schema.expenses.establishmentId, establishmentId),
          gte(schema.expenses.expenseDate, monthDateSlug),
          lte(schema.expenses.expenseDate, nextMonthDateSlug),
        ))

      const monthStock = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.stockMovements.quantity} * ${schema.stockBatches.costPerUnit}), '0')` })
        .from(schema.stockMovements)
        .innerJoin(schema.stockBatches, eq(schema.stockMovements.batchId, schema.stockBatches.id))
        .where(and(
          eq(schema.stockMovements.establishmentId, establishmentId),
          gte(schema.stockMovements.createdAt, monthDate),
          lte(schema.stockMovements.createdAt, nextMonthDate),
        ))

      const rev = Number(monthOrders[0]?.total ?? '0') + Number(monthCash[0]?.total ?? '0')
      const cost = Number(monthExp[0]?.total ?? '0') + totalMonthlyAccounts + Number(monthStock[0]?.total ?? '0')
      const mar = rev > 0 ? ((rev - cost) / rev) * 100 : 0

      monthlyEvolution.unshift({
        month: monthLabel,
        revenue: rev,
        costs: cost,
        margin: Math.round(mar * 100) / 100,
      })
    }

    response.json({
      currentMonth: {
        revenue: monthlyRevenue.toFixed(2),
        costs: totalCosts.toFixed(2),
        margin: Math.round(margin * 100) / 100,
        status,
      },
      breakEvenPoint: breakEvenPoint.toFixed(2),
      monthlyEvolution,
    })
  }
}
