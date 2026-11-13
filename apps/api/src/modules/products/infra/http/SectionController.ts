import { eq, and, asc } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError, NotFoundError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

const sectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
})

export class SectionController {
  constructor(private readonly db: Database) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const rows = await this.db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.establishmentId, establishmentId))
      .orderBy(asc(schema.sections.name))

    response.json(rows)
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const parsed = sectionSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const [section] = await this.db
      .insert(schema.sections)
      .values({
        establishmentId,
        name: parsed.data.name,
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      })
      .returning()

    response.json(section, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = sectionSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const existing = await this.db.query.sections.findFirst({
      where: and(
        eq(schema.sections.id, id),
        eq(schema.sections.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Seção')

    const [updated] = await this.db
      .update(schema.sections)
      .set({
        name: parsed.data.name,
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      })
      .where(and(eq(schema.sections.id, id), eq(schema.sections.establishmentId, establishmentId)))
      .returning()

    response.json(updated)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.sections.findFirst({
      where: and(
        eq(schema.sections.id, id),
        eq(schema.sections.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Seção')

    await this.db
      .delete(schema.sections)
      .where(and(eq(schema.sections.id, id), eq(schema.sections.establishmentId, establishmentId)))

    response.json({ success: true }, 200)
  }
}
