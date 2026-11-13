import { eq, and, asc, lte, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

const ingredientSchema = z.object({
  name: z.string().min(1).max(255),
  unit: z.enum(['un', 'kg', 'g', 'l', 'ml']).optional(),
  costPerUnit: z.number().min(0).optional(),
  minimumStock: z.number().min(0).nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
})

export class IngredientController {
  constructor(private readonly db: Database) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const rows = await this.db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.establishmentId, establishmentId))
      .orderBy(asc(schema.ingredients.name))

    response.json(rows)
  }

  listLowStock: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const rows = await this.db
      .select()
      .from(schema.ingredients)
      .where(
        and(
          eq(schema.ingredients.establishmentId, establishmentId),
          isNotNull(schema.ingredients.minimumStock),
          lte(schema.ingredients.stockQuantity, sql`${schema.ingredients.minimumStock}`)
        )
      )
      .orderBy(asc(schema.ingredients.name))

    response.json(rows)
  }

  countLowStock: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const rows = await this.db
      .select({ id: schema.ingredients.id })
      .from(schema.ingredients)
      .where(
        and(
          eq(schema.ingredients.establishmentId, establishmentId),
          isNotNull(schema.ingredients.minimumStock),
          lte(schema.ingredients.stockQuantity, sql`${schema.ingredients.minimumStock}`)
        )
      )

    response.json({ count: rows.length })
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const parsed = ingredientSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const [ingredient] = await this.db
      .insert(schema.ingredients)
      .values({
        establishmentId,
        name: parsed.data.name,
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.costPerUnit !== undefined && { costPerUnit: String(parsed.data.costPerUnit) }),
        ...(parsed.data.minimumStock !== undefined && { minimumStock: parsed.data.minimumStock === null ? null : String(parsed.data.minimumStock) }),
        ...(parsed.data.sectionId !== undefined && { sectionId: parsed.data.sectionId }),
      })
      .returning()

    response.json(ingredient, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = ingredientSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const existing = await this.db.query.ingredients.findFirst({
      where: and(
        eq(schema.ingredients.id, id),
        eq(schema.ingredients.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Ingrediente')

    const [updated] = await this.db
      .update(schema.ingredients)
      .set({
        name: parsed.data.name,
        updatedAt: new Date(),
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.costPerUnit !== undefined && { costPerUnit: String(parsed.data.costPerUnit) }),
        ...(parsed.data.minimumStock !== undefined && { minimumStock: parsed.data.minimumStock === null ? null : String(parsed.data.minimumStock) }),
        ...(parsed.data.sectionId !== undefined && { sectionId: parsed.data.sectionId }),
      })
      .where(and(eq(schema.ingredients.id, id), eq(schema.ingredients.establishmentId, establishmentId)))
      .returning()

    response.json(updated)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.ingredients.findFirst({
      where: and(
        eq(schema.ingredients.id, id),
        eq(schema.ingredients.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Ingrediente')

    await this.db
      .delete(schema.ingredients)
      .where(and(eq(schema.ingredients.id, id), eq(schema.ingredients.establishmentId, establishmentId)))

    response.json({ success: true }, 200)
  }

  // ── Product Ingredients ──────────────────────────────────────────────────

  listByProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const productId = request.params['productId']!

    const product = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, productId),
        eq(schema.products.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!product) throw new NotFoundError('Produto')

    const rows = await this.db
      .select()
      .from(schema.productIngredients)
      .where(eq(schema.productIngredients.productId, productId))

    response.json(rows)
  }

  addToProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const productId = request.params['productId']!

    const parsed = z.object({
      ingredientId: z.string().uuid(),
      quantity: z.number().positive(),
      unit: z.enum(['un', 'kg', 'g', 'l', 'ml']).optional(),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const product = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, productId),
        eq(schema.products.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!product) throw new NotFoundError('Produto')

    const existing = await this.db.query.productIngredients.findFirst({
      where: and(
        eq(schema.productIngredients.productId, productId),
        eq(schema.productIngredients.ingredientId, parsed.data.ingredientId)
      ),
      columns: { id: true },
    })
    if (existing) throw new ConflictError('Ingrediente já adicionado à ficha técnica')

    const [entry] = await this.db
      .insert(schema.productIngredients)
      .values({
        productId,
        ingredientId: parsed.data.ingredientId,
        quantity: String(parsed.data.quantity),
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      })
      .returning()

    response.json(entry, 201)
  }

  removeFromProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const productId = request.params['productId']!
    const id = request.params['id']!

    const product = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, productId),
        eq(schema.products.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!product) throw new NotFoundError('Produto')

    const existing = await this.db.query.productIngredients.findFirst({
      where: and(
        eq(schema.productIngredients.id, id),
        eq(schema.productIngredients.productId, productId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Item da ficha técnica')

    await this.db
      .delete(schema.productIngredients)
      .where(eq(schema.productIngredients.id, id))

    response.json({ success: true }, 200)
  }
}
