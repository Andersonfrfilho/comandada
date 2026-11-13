import {
  createFiscalProvider,
  FiscalError,
  FiscalConnectionError,
  FiscalTimeoutError,
  type FiscalConfig,
  type TestConnectionResult,
} from '@adatechnology/fiscal-provider'
import { UnprocessableError } from '@/shared/errors/AppError'
import { decryptSensitiveConfig } from '../FiscalConfigCrypto'

export class TestFiscalConnectionUseCase {
  async execute(config: FiscalConfig): Promise<TestConnectionResult> {
    try {
      const provider = createFiscalProvider(config)
      const result = await provider.testConnection({ config })
      return result
    } catch (error) {
      if (error instanceof FiscalConnectionError) {
        return { ok: false, message: error.message }
      }
      if (error instanceof FiscalTimeoutError) {
        return { ok: false, message: `Timeout: ${error.message}` }
      }
      if (error instanceof FiscalError) {
        return { ok: false, message: error.message }
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, message }
    }
  }
}

export function buildFiscalConfigFromDb(
  config: {
    model: string
    environment: string
    cnpj: string | null
    inscricaoEstadual: string | null
    razaoSocial: string | null
    uf: string | null
    municipio: string | null
    cep: string | null
    logradouro: string | null
    numero: string | null
    bairro: string | null
    complemento: string | null
    crt: string | null
    providerConfig: Record<string, unknown> | null
  }
): FiscalConfig {
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

  const providerConfigDecrypted = decryptSensitiveConfig(config.providerConfig ?? {})

  if (config.model === 'nfce' || config.model === 'nfe') {
    return {
      ...base,
      certificadoBase64: String(providerConfigDecrypted['certificadoBase64'] ?? ''),
      certificadoSenha: String(providerConfigDecrypted['certificadoSenha'] ?? ''),
      serie: String(providerConfigDecrypted['serie'] ?? '1'),
      numeroNf: Number(providerConfigDecrypted['numeroNf'] ?? 1),
      codigoMunicipio: String(providerConfigDecrypted['codigoMunicipio'] ?? ''),
      cscId: String(providerConfigDecrypted['cscId'] ?? ''),
      cscToken: String(providerConfigDecrypted['cscToken'] ?? ''),
    } as FiscalConfig
  }

  if (config.model === 'sat') {
    return {
      ...base,
      satUrl: String(providerConfigDecrypted['satUrl'] ?? ''),
      activationCode: String(providerConfigDecrypted['activationCode'] ?? ''),
      signatureAC: String(providerConfigDecrypted['signatureAC'] ?? ''),
    } as FiscalConfig
  }

  throw new UnprocessableError(`Unsupported fiscal model: ${config.model}`)
}
