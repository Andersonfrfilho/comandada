import { readFileSync } from 'fs'
import argon2 from 'argon2'
import path from 'path'

import { db } from '../connection'
import * as schema from '../schema'
import { ImportMenuUseCase } from '@/modules/products/application/use-cases/ImportMenuUseCase'
import type { ImportMenuProductParams } from '@/modules/products/application/use-cases/ImportMenuUseCase'
import { parseCsv } from './helpers/parseCsv'
import { ROLE_IDS, seedRolesAndPermissions } from './roles-permissions.seed'
import { BRANDING_SETTING_KEYS } from '@/modules/settings/shared/branding.constant'
import { prepareProductImage } from '@/modules/products/shared/productImage'
import { toSlug } from '@/shared/utils/toSlug'
import { and, eq, isNull } from 'drizzle-orm'

const YUYAKI_WHATSAPP_NUMBER = '5516994609688'
const YUYAKI_NAME = 'Yuyaki Sushi Bar'
const YUYAKI_DATA_DIRECTORY = path.resolve(import.meta.dir, 'data/yuyaki')

const YUYAKI_ADMIN_EMAIL = 'admin@yuyaki.demo'

// Marca do Yuyaki no painel: laranja do fundo do logo e o logo (dados/yuyaki/marca, sem o fundo preto e reduzido).
// O domínio da demonstração faz a tela de login já abrir com a marca dele.
const YUYAKI_PRIMARY_COLOR = '#C04607'
const YUYAKI_DEMO_DOMAIN = 'comandada-yuyaki.up.railway.app'

// Horário que o bot usa enquanto o cliente não informa o real. Só entra se a chave ainda não
// existir: o que for salvo pelo painel (Configurações) não é sobrescrito no próximo deploy.
const YUYAKI_DEFAULT_BOT_HOURS: Readonly<Record<string, string | boolean>> = {
  opening_time: '18:00',
  closing_time: '23:00',
  working_days: 'ter,qua,qui,sex,sab,dom',
  ignore_hours: false,
  // Endereço do material do cliente (dados/yuyaki/estabelecimento.md); aparece na saudação do bot.
  establishment_address: 'Av. Presidente Vargas, 1343 — Cidade Nova',
  establishment_city: 'Franca - SP',
}

const VARIANT_LABEL_BY_SIZE: Readonly<Record<string, string>> = {
  medio: 'Médio',
  grande: 'Grande',
  copo: 'Copo 350 ml',
  jarra: 'Jarra 750 ml',
}

async function ensureEstablishment(): Promise<string> {
  const existing = await db.query.establishments.findFirst({
    where: (establishment, { eq }) => eq(establishment.whatsappNumber, YUYAKI_WHATSAPP_NUMBER),
  })
  if (existing) return existing.id
  const [created] = await db
    .insert(schema.establishments)
    .values({ name: YUYAKI_NAME, whatsappNumber: YUYAKI_WHATSAPP_NUMBER })
    .returning({ id: schema.establishments.id })
  if (!created) throw new Error('Yuyaki establishment not created')
  return created.id
}

function readCsv(fileName: string): Record<string, string>[] {
  return parseCsv(readFileSync(path.join(YUYAKI_DATA_DIRECTORY, fileName), 'utf-8'))
}

function parseAttributes(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
}

function toProduct(row: Record<string, string>, catalogNameById: Map<string, string>): ImportMenuProductParams {
  const attributes = parseAttributes(row['atributos'])
  const size = typeof attributes['tamanho'] === 'string' ? attributes['tamanho'] : undefined
  const group = typeof attributes['grupo'] === 'string' ? attributes['grupo'] : undefined
  const catalogName = catalogNameById.get(row['categoria_id'] ?? '')
  if (!catalogName) throw new Error(`Unknown category for product ${row['nome']}`)
  return {
    catalogName,
    name: row['nome'] ?? '',
    description: row['descricao'] || undefined,
    price: Number(row['preco']),
    active: row['disponivel'] !== 'false',
    sortOrder: Number(row['id']),
    variantGroup: group,
    variantLabel: size ? VARIANT_LABEL_BY_SIZE[size] : undefined,
  }
}

async function ensureBranding(establishmentId: string): Promise<void> {
  const logo = 'data:image/png;base64,' + readFileSync(path.join(YUYAKI_DATA_DIRECTORY, 'logo.png')).toString('base64')
  const branding: Record<string, string> = {
    [BRANDING_SETTING_KEYS.name]: YUYAKI_NAME,
    [BRANDING_SETTING_KEYS.logo]: logo,
    [BRANDING_SETTING_KEYS.primaryColor]: YUYAKI_PRIMARY_COLOR,
    [BRANDING_SETTING_KEYS.domains]: YUYAKI_DEMO_DOMAIN,
  }
  await db
    .insert(schema.settings)
    .values(Object.entries(branding).map(([key, value]) => ({ establishmentId, key, value })))
    .onConflictDoNothing()
}

async function ensureBotHours(establishmentId: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values(Object.entries(YUYAKI_DEFAULT_BOT_HOURS).map(([key, value]) => ({ establishmentId, key, value })))
    .onConflictDoNothing()
}

// O painel precisa de um login. A senha vem de YUYAKI_ADMIN_PASSWORD e é trocada no primeiro
// acesso; sem a variável, nenhum usuário é criado.
async function ensureAdmin(establishmentId: string): Promise<void> {
  const password = process.env['YUYAKI_ADMIN_PASSWORD']
  if (!password) return
  await seedRolesAndPermissions(establishmentId)
  await db
    .insert(schema.users)
    .values({
      establishmentId,
      roleId: ROLE_IDS.admin,
      name: 'Administrador Yuyaki',
      email: YUYAKI_ADMIN_EMAIL,
      passwordHash: await argon2.hash(password),
      passwordMustChange: true,
      active: true,
    })
    .onConflictDoNothing()
}

// `--categorias 5,6` importa só essas categorias do CSV: serve para incluir itens novos num
// ambiente que já roda, sem regravar preço e descrição dos produtos que o restaurante mexeu no painel.
function parseCategoryFilter(argv: readonly string[]): ReadonlySet<string> | undefined {
  const flagIndex = argv.indexOf('--categorias')
  const raw = flagIndex >= 0 ? argv[flagIndex + 1] : undefined
  if (!raw) return undefined
  return new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))
}

async function readPhotoSource(source: string): Promise<Buffer> {
  if (!/^https?:\/\//.test(source)) return readFileSync(path.join(YUYAKI_DATA_DIRECTORY, source))
  const response = await fetch(source)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Fotos de `fotos.csv` (recortes dos cardápios do restaurante e fotos do iFood dele). Só preenche quem
 * está sem foto: a foto trocada no painel não volta para a do seed no próximo deploy. `--fotos-forcar`
 * regrava todas.
 */
export async function seedYuyakiPhotos(options: { overwrite?: boolean } = {}): Promise<void> {
  const establishmentId = await ensureEstablishment()
  const summary = { saved: [] as string[], skipped: [] as string[], missing: [] as string[], failed: [] as string[] }
  for (const row of readCsv('fotos.csv')) {
    const productName = row['produto'] ?? ''
    const source = row['foto'] ?? ''
    const product = await db.query.products.findFirst({
      where: and(
        eq(schema.products.establishmentId, establishmentId),
        eq(schema.products.slug, toSlug(productName)),
        ...(options.overwrite ? [] : [isNull(schema.products.imageVersion)])
      ),
      columns: { id: true },
    })
    if (!product) {
      const exists = await db.query.products.findFirst({
        where: and(eq(schema.products.establishmentId, establishmentId), eq(schema.products.slug, toSlug(productName))),
        columns: { id: true },
      })
      ;(exists ? summary.skipped : summary.missing).push(productName)
      continue
    }
    try {
      const prepared = await prepareProductImage(await readPhotoSource(source))
      await db.transaction(async (transaction) => {
        await transaction
          .insert(schema.productImages)
          .values({ productId: product.id, content: prepared.content, contentType: 'image/webp' })
          .onConflictDoUpdate({
            target: schema.productImages.productId,
            set: { content: prepared.content, contentType: 'image/webp', updatedAt: new Date() },
          })
        await transaction
          .update(schema.products)
          .set({ imageVersion: prepared.version, updatedAt: new Date() })
          .where(eq(schema.products.id, product.id))
      })
      summary.saved.push(productName)
    } catch (error: unknown) {
      summary.failed.push(`${productName}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log('[Seed] Yuyaki fotos', summary)
}

export async function seedYuyaki(options: { categoryIds?: ReadonlySet<string> | undefined } = {}): Promise<void> {
  const establishmentId = await ensureEstablishment()
  await ensureBotHours(establishmentId)
  await ensureBranding(establishmentId)
  await ensureAdmin(establishmentId)
  const isSelected = (categoryId: string | undefined) => !options.categoryIds || options.categoryIds.has(categoryId ?? '')
  const categoryRows = readCsv('categorias.csv').filter((row) => isSelected(row['id']))
  const catalogNameById = new Map(categoryRows.map((row) => [row['id'] ?? '', row['nome'] ?? '']))

  const result = await new ImportMenuUseCase(db).execute({
    establishmentId,
    catalogs: categoryRows.map((row) => ({
      name: row['nome'] ?? '',
      sortOrder: Number(row['ordem']),
      active: row['ativa'] !== 'false',
    })),
    products: readCsv('produtos.csv')
      .filter((row) => isSelected(row['categoria_id']))
      .map((row) => toProduct(row, catalogNameById)),
  })
  console.log('[Seed] Yuyaki menu', result)
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  // `--fotos` grava só as fotos (o cardápio já está no banco); `--fotos-forcar` regrava as que já existem.
  const onlyPhotos = argv.includes('--fotos') || argv.includes('--fotos-forcar')
  const run = onlyPhotos
    ? seedYuyakiPhotos({ overwrite: argv.includes('--fotos-forcar') })
    : seedYuyaki({ categoryIds: parseCategoryFilter(argv) })
  run
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('[Seed] Yuyaki failed:', error)
      process.exit(1)
    })
}
