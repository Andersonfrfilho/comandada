import { competenceBounds } from '@adatechnology/expense-module'
import { expenseModule } from '@/infra/expenses/expenseModule'
import { eq, and, gte, lt, lte, sql, desc, inArray } from 'drizzle-orm'
import { localMonthRange, localYearMonth, orderRevenueAmount, revenueOrdersWhere, type DateRange } from '@/modules/reports/shared/revenue'
import { batches as stockBatches, movements as stockMovements } from '@adatechnology/stock-module'
import { orderReturnCondition } from '@/modules/products/shared/orderStockMovements'
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
    const currentLocalMonth = localYearMonth(now)
    const currentMonthRange = localMonthRange(currentLocalMonth.year, currentLocalMonth.month)
    const currentMonthStart = currentMonthRange.from
    const currentMonthEnd = currentMonthRange.to

    const currentMonthDateSlug = this.formatDateSlug(currentMonthStart)
    const currentMonthEndSlug = this.formatDateSlug(currentMonthEnd)

    // Faturamento: a mesma regra do Dashboard e dos Relatórios (concluídos menos devoluções). Antes somava
    // também os pagamentos do caixa, e o pedido pago no balcão contava duas vezes.
    const monthlyRevenue = await this.revenueBetween(establishmentId, currentMonthRange)

    // Current month expenses
    const monthExpenses = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.expenses.amount}), '0')` })
      .from(schema.expenses)
      .where(and(
        eq(schema.expenses.establishmentId, establishmentId),
        gte(schema.expenses.expenseDate, currentMonthDateSlug),
        lt(schema.expenses.expenseDate, currentMonthEndSlug),
      ))

    // Contas a pagar do mês (módulo do SDK): o previsto das abertas mais o pago das pagas; cancelada fica de fora.
    const accountsBounds = competenceBounds(expenseModule.clock.today().slice(0, 7))
    const accountsSummary = await expenseModule.expenses.summarize({
      companyId: establishmentId,
      from: accountsBounds.from,
      to: accountsBounds.to,
    })
    const totalMonthlyAccounts = Number(accountsSummary.total)

    const totalStockCosts = await this.stockCostBetween(establishmentId, currentMonthRange)
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
      const monthIndex = currentLocalMonth.month - 1 - i
      const monthYear = currentLocalMonth.year + Math.floor(monthIndex / 12)
      const monthNumber = ((monthIndex % 12) + 12) % 12 + 1
      const monthRange = localMonthRange(monthYear, monthNumber)
      const monthDate = monthRange.from
      const monthLabel = `${monthYear}-${String(monthNumber).padStart(2, '0')}-01`
      const nextMonthDate = monthRange.to
      const monthDateSlug = this.formatDateSlug(monthDate)
      const nextMonthDateSlug = this.formatDateSlug(nextMonthDate)

      const monthExp = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.expenses.amount}), '0')` })
        .from(schema.expenses)
        .where(and(
          eq(schema.expenses.establishmentId, establishmentId),
          gte(schema.expenses.expenseDate, monthDateSlug),
          lt(schema.expenses.expenseDate, nextMonthDateSlug),
        ))

      const monthStockCost = await this.stockCostBetween(establishmentId, monthRange)

      const rev = await this.revenueBetween(establishmentId, monthRange)
      const cost = Number(monthExp[0]?.total ?? '0') + totalMonthlyAccounts + monthStockCost
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

  private async revenueBetween(establishmentId: string, range: DateRange): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${orderRevenueAmount}), 0)` })
      .from(schema.orders)
      .where(revenueOrdersWhere(establishmentId, range))
    return Number(row?.total ?? 0)
  }

  /**
   * Custo do estoque no mês: o que saiu (baixa de pedido e perda) pelo custo do lote, menos o que voltou
   * por cancelamento. Entrada de compra não é custo aqui: ela vira custo quando é consumida.
   */
  private async stockCostBetween(establishmentId: string, range: DateRange): Promise<number> {
    // `delta` tem sinal: saída e perda são negativas (custo positivo) e a devolução é positiva (custo negativo).
    const signedCost = sql`-(${stockMovements.delta} * ${stockBatches.costPerUnit})`
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${signedCost}), 0)` })
      .from(stockMovements)
      .innerJoin(stockBatches, eq(stockMovements.batchId, stockBatches.id))
      .where(and(
        eq(stockMovements.companyId, establishmentId),
        sql`(${stockMovements.kind} IN ('out', 'loss') OR ${orderReturnCondition})`,
        gte(stockMovements.createdAt, range.from),
        lt(stockMovements.createdAt, range.to),
      ))
    return Number(row?.total ?? 0)
  }
}
