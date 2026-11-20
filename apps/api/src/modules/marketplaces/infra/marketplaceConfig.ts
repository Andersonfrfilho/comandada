import type { MarketplacePlatform, MarketplaceProvider } from '../domain/Marketplace'
import { IfoodMarketplaceProvider } from '@adatechnology/ifood-marketplace-provider'
import { OpenDeliveryMarketplaceProvider } from '@adatechnology/opendelivery-marketplace-provider'
import type { FetchFunction } from '@adatechnology/marketplace-contracts'

type Environment = Record<string, string | undefined>

/** Plataforma ligada: o conector e o restaurante do ComandAdA que recebe os pedidos dela. */
export interface MarketplaceConnection {
  provider: MarketplaceProvider
  establishmentId: string
  /** Lojas na plataforma (merchantId do iFood, id da loja nas outras), para financeiro e avaliações. */
  merchantIds: string[]
}

export interface MarketplaceSetup {
  connections: Map<MarketplacePlatform, MarketplaceConnection>
  /** Plataformas com `*_ENABLED=true` mas faltando variável: aparecem no log, não derrubam nada. */
  problems: string[]
  autoConfirm: boolean
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function missing(environment: Environment, names: string[]): string[] {
  return names.filter((name) => !environment[name]?.trim())
}

/**
 * Lê as variáveis de cada plataforma. Tudo desligado por padrão: só liga com `<PLATAFORMA>_ENABLED=true`
 * e todas as credenciais preenchidas.
 *
 * iFood: IFOOD_ENABLED, IFOOD_CLIENT_ID, IFOOD_CLIENT_SECRET, IFOOD_MERCHANT_IDS (ou IFOOD_MERCHANT_ID),
 *        IFOOD_ESTABLISHMENT_ID, IFOOD_API_BASE_URL (opcional).
 * 99Food (Open Delivery): FOOD99_ENABLED, FOOD99_API_BASE_URL, FOOD99_CLIENT_ID, FOOD99_CLIENT_SECRET,
 *        FOOD99_MERCHANT_IDS, FOOD99_ESTABLISHMENT_ID, FOOD99_TOKEN_URL (opcional).
 */
export function readMarketplaceSetup(
  environment: Environment = process.env,
  fetchFunction?: FetchFunction
): MarketplaceSetup {
  const connections = new Map<MarketplacePlatform, MarketplaceConnection>()
  const problems: string[] = []

  if (environment['IFOOD_ENABLED'] === 'true') {
    const merchantIds = list(environment['IFOOD_MERCHANT_IDS'] ?? environment['IFOOD_MERCHANT_ID'])
    const absent = missing(environment, ['IFOOD_CLIENT_ID', 'IFOOD_CLIENT_SECRET', 'IFOOD_ESTABLISHMENT_ID'])
    if (merchantIds.length === 0) absent.push('IFOOD_MERCHANT_IDS')
    if (absent.length > 0) problems.push(`iFood ligado sem ${absent.join(', ')}`)
    else
      connections.set('ifood', {
        establishmentId: environment['IFOOD_ESTABLISHMENT_ID']!.trim(),
        merchantIds,
        provider: new IfoodMarketplaceProvider(
          {
            clientId: environment['IFOOD_CLIENT_ID']!.trim(),
            clientSecret: environment['IFOOD_CLIENT_SECRET']!.trim(),
            merchantIds,
            baseUrl: environment['IFOOD_API_BASE_URL']?.trim() || undefined,
          },
          fetchFunction
        ),
      })
  }

  if (environment['FOOD99_ENABLED'] === 'true') {
    const merchantIds = list(environment['FOOD99_MERCHANT_IDS'])
    const absent = missing(environment, ['FOOD99_API_BASE_URL', 'FOOD99_CLIENT_ID', 'FOOD99_CLIENT_SECRET', 'FOOD99_ESTABLISHMENT_ID'])
    if (merchantIds.length === 0) absent.push('FOOD99_MERCHANT_IDS')
    if (absent.length > 0) problems.push(`99Food ligada sem ${absent.join(', ')}`)
    else
      connections.set('99food', {
        establishmentId: environment['FOOD99_ESTABLISHMENT_ID']!.trim(),
        merchantIds,
        provider: new OpenDeliveryMarketplaceProvider(
          {
            platform: '99food',
            baseUrl: environment['FOOD99_API_BASE_URL']!.trim(),
            tokenUrl: environment['FOOD99_TOKEN_URL']?.trim() || undefined,
            clientId: environment['FOOD99_CLIENT_ID']!.trim(),
            clientSecret: environment['FOOD99_CLIENT_SECRET']!.trim(),
            merchantIds,
          },
          fetchFunction
        ),
      })
  }

  return {
    connections,
    problems,
    autoConfirm: environment['MARKETPLACE_AUTO_CONFIRM'] !== 'false',
  }
}
