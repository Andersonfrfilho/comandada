import { eq, and, asc, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import type { ProductLookupProvider } from '@/shared/providers/ProductLookupProvider'
import type { RegionalPriceResolver } from '@/shared/providers/RegionalPriceProvider'
import { regionalPriceQuerySchema } from '@/shared/providers/RegionalPriceProvider'
import { PRODUCT_LOOKUP_MIN_QUERY_LENGTH } from '@/shared/constants/productLookup.constant'
import {
  REGIONAL_PRICE_DEFAULT_RADIUS_KM,
  REGIONAL_PRICE_MAX_RADIUS_KM,
} from '@/shared/constants/regionalPrice.constant'
import { PRODUCT_AFFINITY_SUGGESTION_LIMIT } from '@/infra/queue/QueueNames.constant'
import { parseMultipart } from '@/shared/utils/parseMultipart'
import { parseProductsCsv } from '../../application/parseProductsCsv'
import { toSlug } from '@/shared/utils/toSlug'

type Database = NodePgDatabase<typeof schema>

const catalogSchema = z.object({
  name: z.string().min(1).max(100),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  ncmCode: z.string().max(8).optional(),
  cfopCode: z.string().max(4).optional(),
  cstIcms: z.string().max(3).optional(),
})

const productSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().positive(),
  costPrice: z.number().positive().nullable().optional(),
  unit: z.enum(['un', 'kg', 'g', 'l', 'ml']).optional(),
  barcode: z.string().max(20).nullable().optional(),
  catalogId: z.string().uuid().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  preparationTimeMinutes: z.number().int().positive().nullable().optional(),
  preparationInstructions: z.string().nullable().optional(),
  active: z.boolean().optional(),
  isKit: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

const kitComponentsSchema = z.object({
  components: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .max(20),
})

/** Endereço do estabelecimento mora em `settings`; a tabela não tem colunas de local. */
const establishmentLocationSchema = z.object({
  state: z.string().length(2).optional(),
  postalCode: z.string().optional(),
})

export class CatalogController {
  constructor(
    private readonly db: Database,
    private readonly cache: CacheProvider,
    private readonly productLookupProvider: ProductLookupProvider,
    private readonly regionalPriceResolver: RegionalPriceResolver
  ) {}

  private async invalidateCache(establishmentId: string): Promise<void> {
    await Promise.all([
      this.cache.delete(`products:list:${establishmentId}:true`),
      this.cache.delete(`products:list:${establishmentId}:false`),
      this.cache.delete(`menu:${establishmentId}`),
    ])
  }

  // ── Catalogs ────────────────────────────────────────────────────────────

  listCatalogs: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const cats = await this.db
      .select()
      .from(schema.catalogs)
      .where(eq(schema.catalogs.establishmentId, establishmentId))
      .orderBy(asc(schema.catalogs.sortOrder), asc(schema.catalogs.name))

    response.json(cats)
  }

  createCatalog: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const parsed = catalogSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const slug = toSlug(parsed.data.name)

    const existing = await this.db.query.catalogs.findFirst({
      where: and(
        eq(schema.catalogs.establishmentId, establishmentId),
        eq(schema.catalogs.slug, slug)
      ),
      columns: { id: true },
    })
    if (existing) throw new ConflictError('Catálogo com esse nome já existe')

    const [cat] = await this.db
      .insert(schema.catalogs)
      .values({
        establishmentId,
        name: parsed.data.name,
        slug,
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
        ...(parsed.data.ncmCode !== undefined && { ncmCode: parsed.data.ncmCode }),
        ...(parsed.data.cfopCode !== undefined && { cfopCode: parsed.data.cfopCode }),
        ...(parsed.data.cstIcms !== undefined && { cstIcms: parsed.data.cstIcms }),
      })
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(cat, 201)
  }

  updateCatalog: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = catalogSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const existing = await this.db.query.catalogs.findFirst({
      where: and(
        eq(schema.catalogs.id, id),
        eq(schema.catalogs.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Catálogo')

    const slug = toSlug(parsed.data.name)

    if (slug !== existing.slug) {
      const conflict = await this.db.query.catalogs.findFirst({
        where: and(
          eq(schema.catalogs.establishmentId, establishmentId),
          eq(schema.catalogs.slug, slug)
        ),
        columns: { id: true },
      })
      if (conflict) throw new ConflictError('Catálogo com esse nome já existe')
    }

    const [updated] = await this.db
      .update(schema.catalogs)
      .set({
        name: parsed.data.name,
        slug,
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
        ...(parsed.data.ncmCode !== undefined && { ncmCode: parsed.data.ncmCode }),
        ...(parsed.data.cfopCode !== undefined && { cfopCode: parsed.data.cfopCode }),
        ...(parsed.data.cstIcms !== undefined && { cstIcms: parsed.data.cstIcms }),
      })
      .where(and(eq(schema.catalogs.id, id), eq(schema.catalogs.establishmentId, establishmentId)))
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  deleteCatalog: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.catalogs.findFirst({
      where: and(
        eq(schema.catalogs.id, id),
        eq(schema.catalogs.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Catálogo')

    // Produtos ficam sem catálogo (catalogId → null via ON DELETE SET NULL)
    await this.db
      .delete(schema.catalogs)
      .where(and(eq(schema.catalogs.id, id), eq(schema.catalogs.establishmentId, establishmentId)))

    await this.invalidateCache(establishmentId)
    response.json({ success: true }, 200)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  listProducts: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const prods = await this.db
      .select()
      .from(schema.products)
      .where(eq(schema.products.establishmentId, establishmentId))
      .orderBy(asc(schema.products.sortOrder), asc(schema.products.name))

    response.json(prods)
  }

  createProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const parsed = productSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const slug = toSlug(parsed.data.name)

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.establishmentId, establishmentId),
        eq(schema.products.slug, slug)
      ),
      columns: { id: true },
    })
    if (existing) throw new ConflictError('Produto com esse nome já existe')

    const [prod] = await this.db
      .insert(schema.products)
      .values({
        establishmentId,
        name: parsed.data.name,
        slug,
        price: String(parsed.data.price),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.costPrice !== undefined && { costPrice: parsed.data.costPrice === null ? null : String(parsed.data.costPrice) }),
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.barcode !== undefined && { barcode: parsed.data.barcode }),
        ...(parsed.data.catalogId !== undefined && { catalogId: parsed.data.catalogId }),
        ...(parsed.data.sectionId !== undefined && { sectionId: parsed.data.sectionId }),
        ...(parsed.data.preparationTimeMinutes !== undefined && { preparationTimeMinutes: parsed.data.preparationTimeMinutes }),
        ...(parsed.data.preparationInstructions !== undefined && { preparationInstructions: parsed.data.preparationInstructions }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.isKit !== undefined && { isKit: parsed.data.isKit }),
        ...(parsed.data.allowNegativeStock !== undefined && { allowNegativeStock: parsed.data.allowNegativeStock }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(prod, 201)
  }

  updateProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = productSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, id),
        eq(schema.products.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Produto')

    const slug = toSlug(parsed.data.name)

    if (slug !== existing.slug) {
      const conflict = await this.db.query.products.findFirst({
        where: and(
          eq(schema.products.establishmentId, establishmentId),
          eq(schema.products.slug, slug)
        ),
        columns: { id: true },
      })
      if (conflict) throw new ConflictError('Produto com esse nome já existe')
    }

    const [updated] = await this.db
      .update(schema.products)
      .set({
        name: parsed.data.name,
        slug,
        price: String(parsed.data.price),
        updatedAt: new Date(),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.costPrice !== undefined && { costPrice: parsed.data.costPrice === null ? null : String(parsed.data.costPrice) }),
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.barcode !== undefined && { barcode: parsed.data.barcode }),
        ...(parsed.data.catalogId !== undefined && { catalogId: parsed.data.catalogId }),
        ...(parsed.data.sectionId !== undefined && { sectionId: parsed.data.sectionId }),
        ...(parsed.data.preparationTimeMinutes !== undefined && { preparationTimeMinutes: parsed.data.preparationTimeMinutes }),
        ...(parsed.data.preparationInstructions !== undefined && { preparationInstructions: parsed.data.preparationInstructions }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.isKit !== undefined && { isKit: parsed.data.isKit }),
        ...(parsed.data.allowNegativeStock !== undefined && { allowNegativeStock: parsed.data.allowNegativeStock }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .where(and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)))
      .returning()

    // Preço é o único campo com histórico: é o que o gerente precisa responder
    // "quando esse item subiu", e o dado deixa de existir se não for gravado aqui.
    if (updated && Number(existing.price) !== Number(updated.price)) {
      await this.db.insert(schema.productPriceHistory).values({
        establishmentId,
        productId: id,
        userId: request.user.id,
        previousPrice: existing.price,
        newPrice: updated.price,
      })
    }

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  getProductPriceHistory: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.products.findFirst({
      where: and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Produto')

    const history = await this.db.query.productPriceHistory.findMany({
      where: and(
        eq(schema.productPriceHistory.productId, id),
        eq(schema.productPriceHistory.establishmentId, establishmentId)
      ),
      orderBy: (row, { desc }) => [desc(row.createdAt)],
      with: { user: { columns: { id: true, name: true } } },
    })

    response.json(history)
  }

  // ── Kits ──────────────────────────────────────────────────────────────────

  private async findOwnedProduct(id: string, establishmentId: string) {
    const product = await this.db.query.products.findFirst({
      where: and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)),
    })
    if (!product) throw new NotFoundError('Produto')
    return product
  }

  listKitComponents: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    await this.findOwnedProduct(id, establishmentId)

    const components = await this.db.query.productComponents.findMany({
      where: eq(schema.productComponents.kitProductId, id),
      with: { component: { columns: { id: true, name: true, price: true, active: true } } },
    })

    response.json(components)
  }

  setKitComponents: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = kitComponentsSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const kit = await this.findOwnedProduct(id, establishmentId)
    if (!kit.isKit) throw new ValidationError('Produto não é um kit')

    const componentIds = parsed.data.components.map((component) => component.productId)
    if (componentIds.includes(id)) throw new ValidationError('Kit não pode conter a si mesmo')

    const found = await this.db.query.products.findMany({
      where: and(
        inArray(schema.products.id, componentIds),
        eq(schema.products.establishmentId, establishmentId)
      ),
      columns: { id: true, isKit: true, name: true },
    })

    if (found.length !== componentIds.length) {
      throw new ValidationError('Componente inexistente neste estabelecimento')
    }

    // Sem isso a expansão da baixa de estoque seria recursiva, e um ciclo
    // (A contém B, B contém A) travaria o fechamento de um pedido.
    const nestedKit = found.find((component) => component.isKit)
    if (nestedKit) {
      throw new ValidationError(`Componente "${nestedKit.name}" é um kit; kit não pode conter kit`)
    }

    // Substituição atômica: a composição salva é a que o usuário viu na tela, e não
    // existe janela em que o kit fique com metade dos componentes.
    await this.db.transaction(async (transaction) => {
      await transaction
        .delete(schema.productComponents)
        .where(eq(schema.productComponents.kitProductId, id))

      if (parsed.data.components.length > 0) {
        await transaction.insert(schema.productComponents).values(
          parsed.data.components.map((component) => ({
            kitProductId: id,
            componentProductId: component.productId,
            quantity: component.quantity,
          }))
        )
      }
    })

    const components = await this.db.query.productComponents.findMany({
      where: eq(schema.productComponents.kitProductId, id),
      with: { component: { columns: { id: true, name: true, price: true, active: true } } },
    })

    await this.invalidateCache(establishmentId)
    response.json(components)
  }

  getProductAffinities: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.products.findFirst({
      where: and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Produto')

    // Só leitura da tabela materializada. O cálculo é do job: varrer o histórico
    // aqui colocaria uma agregação de 90 dias dentro do tempo de resposta da tela.
    const affinities = await this.db.query.productAffinities.findMany({
      where: and(
        eq(schema.productAffinities.productId, id),
        eq(schema.productAffinities.establishmentId, establishmentId)
      ),
      orderBy: (row, { desc }) => [desc(row.confidence), desc(row.coOccurrenceCount)],
      limit: PRODUCT_AFFINITY_SUGGESTION_LIMIT,
      with: {
        suggestedProduct: {
          columns: { id: true, name: true, price: true, active: true },
        },
      },
    })

    // Produto desativado depois do último cálculo continua na tabela até o próximo
    // job; sugerir item que não está à venda é pior do que sugerir menos.
    response.json(affinities.filter((affinity) => affinity.suggestedProduct?.active))
  }

  toggleProductActive: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, id),
        eq(schema.products.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Produto')

    const [updated] = await this.db
      .update(schema.products)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)))
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  deleteProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, id),
        eq(schema.products.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Produto')

    // O `ON DELETE restrict` do banco já impede apagar um item que compõe kit, mas
    // sozinho ele estoura como 500. Apagar produto usado em kit é condição de negócio
    // previsível, e quem chamou precisa saber qual kit está no caminho.
    const usedInKit = await this.db.query.productComponents.findFirst({
      where: eq(schema.productComponents.componentProductId, id),
      with: { kit: { columns: { name: true } } },
    })
    if (usedInKit) {
      throw new ConflictError(
        `Produto compõe o kit "${usedInKit.kit?.name ?? 'sem nome'}"; remova-o do kit antes de apagar`
      )
    }

    await this.db
      .delete(schema.products)
      .where(and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)))

    await this.invalidateCache(establishmentId)
    response.json({ success: true }, 200)
  }

  bulkImportProducts: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ValidationError('Content-Type deve ser multipart/form-data')
    }

    const parsed = parseMultipart(request.rawBody, contentType)
    const csvFile = parsed.files[0]
    if (!csvFile) throw new ValidationError('Nenhum arquivo enviado no campo "file"')

    const { rows, errors } = parseProductsCsv(csvFile.buffer.toString('utf-8'))

    const catalogs = await this.db.query.catalogs.findMany({
      where: eq(schema.catalogs.establishmentId, establishmentId),
      columns: { id: true, name: true },
    })
    const catalogIdByName = new Map(catalogs.map((catalog) => [catalog.name.toLowerCase(), catalog.id]))

    let succeeded = 0

    for (const row of rows) {
      const slug = toSlug(row.name)

      const existing = await this.db.query.products.findFirst({
        where: and(
          eq(schema.products.establishmentId, establishmentId),
          eq(schema.products.slug, slug)
        ),
        columns: { id: true },
      })
      if (existing) {
        errors.push({ row: row.row, message: `Produto "${row.name}" já existe` })
        continue
      }

      await this.db.insert(schema.products).values({
        establishmentId,
        name: row.name,
        slug,
        price: String(row.price),
        ...(row.description && { description: row.description }),
        ...(row.unit && { unit: row.unit }),
        ...(row.barcode && { barcode: row.barcode }),
        ...(row.catalogName && { catalogId: catalogIdByName.get(row.catalogName.toLowerCase()) ?? null }),
      })

      succeeded += 1
    }

    if (succeeded > 0) await this.invalidateCache(establishmentId)

    response.json({ succeeded, failed: errors.length, errors }, 201)
  }

  productSearch: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const query = request.query['q'] ?? ''
    if (query.length < PRODUCT_LOOKUP_MIN_QUERY_LENGTH) {
      response.json([])
      return
    }
    const suggestions = await this.productLookupProvider.search(query)
    response.json(suggestions)
  }

  productLookup: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const barcode = request.params['barcode']!
    const suggestion = await this.productLookupProvider.getByBarcode(barcode)
    if (!suggestion) throw new NotFoundError('Produto')
    response.json(suggestion)
  }

  /**
   * Preço praticado na região, quando disponível.
   *
   * A cobertura é por UF e vem de NFC-e estadual, então indisponível é resposta
   * normal — o envelope carrega `available` e um motivo em vez de erro, para a tela
   * poder dizer "sem cobertura na sua região" sem parecer falha do sistema.
   */
  regionalPrice: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const establishment = await this.db.query.establishments.findFirst({
      where: eq(schema.establishments.id, establishmentId),
      columns: { settings: true },
    })
    if (!establishment) throw new NotFoundError('Estabelecimento')

    const settings = establishmentLocationSchema.safeParse(establishment.settings ?? {})
    const state = request.query['uf'] ?? (settings.success ? settings.data.state : undefined)
    const postalCode = (
      request.query['cep'] ??
      (settings.success ? settings.data.postalCode : undefined) ??
      ''
    ).replace(/\D/g, '')

    if (!state) {
      response.json({ available: false, reason: 'uf_nao_configurada', quote: null })
      return
    }

    const requestedRadius = Number(request.query['raio'] ?? REGIONAL_PRICE_DEFAULT_RADIUS_KM)
    const radiusKm = Math.min(
      Number.isFinite(requestedRadius) && requestedRadius > 0
        ? Math.trunc(requestedRadius)
        : REGIONAL_PRICE_DEFAULT_RADIUS_KM,
      REGIONAL_PRICE_MAX_RADIUS_KM
    )

    const query = regionalPriceQuerySchema.safeParse({
      barcode: request.params['barcode'],
      postalCode,
      radiusKm,
    })
    if (!query.success) throw new ValidationError('Código de barras ou CEP inválido')

    const quote = await this.regionalPriceResolver.getQuoteForState(state, query.data)
    if (!quote) {
      response.json({ available: false, reason: 'sem_cobertura', quote: null })
      return
    }

    response.json({ available: true, quote })
  }
}
