import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalConfiguration, FiscalDocument } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import {
  createFiscalProvider,
  FiscalError,
  type FiscalProvider,
  type FiscalConfig,
} from '@adatechnology/fiscal-provider'
import { decryptSensitiveConfig } from '../FiscalConfigCrypto'

type Database = NodePgDatabase<typeof schema>

export class CancelFiscalDocumentUseCase {
  constructor(
    private readonly database: Database,
    private readonly websocketHub: WebSocketHub
  ) {}

  async execute(params: {
    fiscalDocumentId: string
    establishmentId: string
    justificativa: string
  }): Promise<{ success: boolean; protocolo: string | null }> {
    const { fiscalDocumentId, establishmentId, justificativa } = params

    if (justificativa.length < 15) {
      throw new UnprocessableError('Justificativa must be at least 15 characters')
    }
    if (justificativa.length > 255) {
      throw new UnprocessableError('Justificativa must be at most 255 characters')
    }

    const document = await this.database.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.id, fiscalDocumentId),
        eq(schema.fiscalDocuments.establishmentId, establishmentId)
      ),
    })
    if (!document) throw new NotFoundError('Fiscal document')

    if (document.status !== 'authorized') {
      throw new UnprocessableError('Only authorized documents can be cancelled')
    }

    if (!document.authorizedAt) {
      throw new UnprocessableError('Document has no authorization timestamp')
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
    if (document.authorizedAt < thirtyMinutesAgo) {
      throw new UnprocessableError('Cancellation window of 30 minutes has expired')
    }

    const fiscalConfig = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })
    if (!fiscalConfig) throw new NotFoundError('Fiscal configuration')

    const providerConfig = this.buildProviderConfig(fiscalConfig)

    try {
      const provider: FiscalProvider = createFiscalProvider(providerConfig)
      const result = await provider.cancel({
        chaveAcesso: document.chaveAcesso!,
        justificativa,
        config: providerConfig,
        ...(document.protocolo ? { protocolo: document.protocolo } : {}),
      } as Parameters<FiscalProvider['cancel']>[0])

      if (result.success) {
        await this.database.update(schema.fiscalDocuments)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: justificativa,
            cancellationProtocol: result.protocolo ?? null,
            providerResponse: result.rawResponse as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

        await this.websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_CANCELLED, {
          fiscalDocumentId,
          protocolo: result.protocolo,
        })

        return { success: true, protocolo: result.protocolo ?? null }
      }

      throw new UnprocessableError(
        result.errorMessage ?? 'Cancellation rejected by SEFAZ'
      )
    } catch (error) {
      if (error instanceof UnprocessableError) throw error
      if (error instanceof NotFoundError) throw error

      const errorMessage = error instanceof FiscalError
        ? error.message
        : error instanceof Error ? error.message : 'Cancellation failed'

      throw new UnprocessableError(errorMessage)
    }
  }

  private buildProviderConfig(config: FiscalConfiguration): FiscalConfig {
    const base = {
      model: config.model as 'nfce' | 'nfe' | 'sat',
      environment: config.environment as 'homologacao' | 'producao',
      cnpj: config.cnpj ?? '',
      inscricaoEstadual: config.inscricaoEstadual ?? '',
      razaoSocial: config.razaoSocial ?? '',
      uf: config.uf ?? '',
      municipio: config.municipio ?? '',
      cep: config.cep ?? '',
      logradouro: config.logradouro ?? '',
      numero: config.numero ?? '',
      bairro: config.bairro ?? '',
      complemento: config.complemento ?? undefined,
      crt: (config.crt ?? '1') as '1' | '2' | '3',
    }

    const providerConfig = decryptSensitiveConfig((config.providerConfig ?? {}) as Record<string, unknown>)

    if (config.model === 'nfce' || config.model === 'nfe') {
      return {
        ...base,
        certificadoBase64: String(providerConfig['certificadoBase64'] ?? ''),
        certificadoSenha: String(providerConfig['certificadoSenha'] ?? ''),
        serie: String(providerConfig['serie'] ?? '1'),
        numeroNf: Number(providerConfig['numeroNf'] ?? 1),
        codigoMunicipio: String(providerConfig['codigoMunicipio'] ?? ''),
        cscId: String(providerConfig['cscId'] ?? ''),
        cscToken: String(providerConfig['cscToken'] ?? ''),
      } as FiscalConfig
    }

    if (config.model === 'sat') {
      return {
        ...base,
        satUrl: String(providerConfig['satUrl'] ?? ''),
        activationCode: String(providerConfig['activationCode'] ?? ''),
        signatureAC: String(providerConfig['signatureAC'] ?? ''),
      } as FiscalConfig
    }

    throw new UnprocessableError(`Unsupported fiscal model: ${config.model}`)
  }
}
