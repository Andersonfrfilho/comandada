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

const YUYAKI_WHATSAPP_NUMBER = '5516994609688'
const YUYAKI_NAME = 'Yuyaki Sushi Bar'
const YUYAKI_DATA_DIRECTORY = path.resolve(import.meta.dir, 'data/yuyaki')

const YUYAKI_ADMIN_EMAIL = 'admin@yuyaki.demo'

// Marca do Yuyaki no painel: laranja do fundo do logo e o logo (dados/yuyaki/marca, reduzido).
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
}

const VARIANT_LABEL_BY_SIZE: Readonly<Record<string, string>> = { medio: 'Médio', grande: 'Grande' }

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
  const logo = 'data:image/jpeg;base64,' + readFileSync(path.join(YUYAKI_DATA_DIRECTORY, 'logo.jpg')).toString('base64')
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

export async function seedYuyaki(): Promise<void> {
  const establishmentId = await ensureEstablishment()
  await ensureBotHours(establishmentId)
  await ensureBranding(establishmentId)
  await ensureAdmin(establishmentId)
  const categoryRows = readCsv('categorias.csv')
  const catalogNameById = new Map(categoryRows.map((row) => [row['id'] ?? '', row['nome'] ?? '']))

  const result = await new ImportMenuUseCase(db).execute({
    establishmentId,
    catalogs: categoryRows.map((row) => ({
      name: row['nome'] ?? '',
      sortOrder: Number(row['ordem']),
      active: row['ativa'] !== 'false',
    })),
    products: readCsv('produtos.csv').map((row) => toProduct(row, catalogNameById)),
  })
  console.log('[Seed] Yuyaki menu', result)
}

if (import.meta.main) {
  seedYuyaki()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('[Seed] Yuyaki failed:', error)
      process.exit(1)
    })
}
