import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalConfiguration } from '@/infra/database/schema'
import { encryptSensitiveConfig } from '../FiscalConfigCrypto'

type Database = NodePgDatabase<typeof schema>

type UpsertFiscalConfigInput = {
  establishmentId: string
  model: FiscalConfiguration['model']
  environment: string
  cnpj: string | null
  inscricaoEstadual: string | null
  razaoSocial: string | null
  uf: string | null
  municipio: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  crt: string | null
  emitTrigger?: string | undefined
  emailProvider?: string | undefined
  providerConfig?: Record<string, unknown>
  active: boolean
}

const SENSITIVE_KEYS = ['certificadoBase64', 'certificadoSenha', 'cscToken', 'activationCode', 'signatureAC'] as const

function mergeProviderConfig(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!incoming || Object.keys(incoming).length === 0) return (existing as Record<string, unknown>) ?? {}
  if (!existing) return incoming

  const merged = { ...existing }
  for (const [key, value] of Object.entries(incoming)) {
    if (value === '' || value === null || value === undefined) continue
    if (typeof value === 'string' && value.startsWith('***')) continue
    merged[key] = value
  }
  return merged
}

function sanitizeProviderConfig(providerConfig: Record<string, unknown> | null): Record<string, unknown> {
  if (!providerConfig) return {}

  const sanitized = { ...providerConfig }
  for (const key of SENSITIVE_KEYS) {
    const value = sanitized[key]
    if (value && typeof value === 'string' && value.length > 4) {
      sanitized[key] = `***${value.slice(-4)}`
    }
  }

  return sanitized
}

export class UpsertFiscalConfigUseCase {
  constructor(private readonly database: Database) {}

  async execute(input: UpsertFiscalConfigInput): Promise<FiscalConfiguration> {
    const existing = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, input.establishmentId),
    })

    if (existing) {
      const mergedConfig = mergeProviderConfig(
        existing.providerConfig as Record<string, unknown>,
        input.providerConfig
      )

      const [updated] = await this.database
        .update(schema.fiscalConfigurations)
        .set({
          model: input.model,
          environment: input.environment,
          cnpj: input.cnpj ?? null,
          inscricaoEstadual: input.inscricaoEstadual ?? null,
          razaoSocial: input.razaoSocial ?? null,
          uf: input.uf ?? null,
          municipio: input.municipio ?? null,
          cep: input.cep ?? null,
          logradouro: input.logradouro ?? null,
          numero: input.numero ?? null,
          complemento: input.complemento ?? null,
          bairro: input.bairro ?? null,
          crt: input.crt ?? '1',
          emitTrigger: input.emitTrigger ?? existing.emitTrigger,
          emailProvider: input.emailProvider ?? existing.emailProvider,
          providerConfig: encryptSensitiveConfig(mergedConfig),
          active: input.active ?? existing.active,
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalConfigurations.establishmentId, input.establishmentId))
        .returning()

      return updated!
    }

    const [created] = await this.database
      .insert(schema.fiscalConfigurations)
      .values({
        establishmentId: input.establishmentId,
        model: input.model,
        environment: input.environment,
        cnpj: input.cnpj ?? null,
        inscricaoEstadual: input.inscricaoEstadual ?? null,
        razaoSocial: input.razaoSocial ?? null,
        uf: input.uf ?? null,
        municipio: input.municipio ?? null,
        cep: input.cep ?? null,
        logradouro: input.logradouro ?? null,
        numero: input.numero ?? null,
        complemento: input.complemento ?? null,
        bairro: input.bairro ?? null,
        crt: input.crt ?? '1',
        emitTrigger: input.emitTrigger ?? 'on_payment',
        emailProvider: input.emailProvider ?? 'resend',
        providerConfig: encryptSensitiveConfig(input.providerConfig ?? {}),
        active: input.active ?? false,
      })
      .returning()

    return created!
  }

  async getByEstablishment(establishmentId: string): Promise<FiscalConfiguration | null> {
    const config = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })

    if (!config) return null

    return {
      ...config,
      providerConfig: sanitizeProviderConfig(config.providerConfig as Record<string, unknown>),
    }
  }
}
