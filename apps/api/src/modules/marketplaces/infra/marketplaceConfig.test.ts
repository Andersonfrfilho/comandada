import { describe, expect, it } from 'bun:test'
import { readMarketplaceSetup } from './marketplaceConfig'
import { Food99MarketplaceProvider } from '@adatechnology/food99-marketplace-provider'
import { OpenDeliveryMarketplaceProvider } from '@adatechnology/opendelivery-marketplace-provider'

describe('readMarketplaceSetup', () => {
  it('tudo desligado sem variáveis', () => {
    const setup = readMarketplaceSetup({})
    expect(setup.connections.size).toBe(0)
    expect(setup.problems).toEqual([])
    expect(setup.autoConfirm).toBe(true)
  })

  it('ligado sem credencial completa fica de fora e explica', () => {
    const setup = readMarketplaceSetup({ IFOOD_ENABLED: 'true', IFOOD_CLIENT_ID: 'x', FOOD99_ENABLED: 'true' })
    expect(setup.connections.size).toBe(0)
    expect(setup.problems[0]).toContain('IFOOD_CLIENT_SECRET')
    expect(setup.problems[0]).toContain('IFOOD_MERCHANT_IDS')
    expect(setup.problems[1]).toContain('FOOD99_APP_ID')
    expect(setup.problems[1]).toContain('FOOD99_SHOP_IDS')
  })

  it('liga cada plataforma com as credenciais (aceita IFOOD_MERCHANT_ID antigo)', () => {
    const setup = readMarketplaceSetup({
      IFOOD_ENABLED: 'true',
      IFOOD_CLIENT_ID: 'id',
      IFOOD_CLIENT_SECRET: 'secret',
      IFOOD_MERCHANT_ID: 'm1',
      IFOOD_ESTABLISHMENT_ID: 'est-1',
      FOOD99_ENABLED: 'true',
      FOOD99_API_BASE_URL: 'https://x.test',
      FOOD99_CLIENT_ID: 'id',
      FOOD99_CLIENT_SECRET: 'secret',
      FOOD99_MERCHANT_IDS: 'a, b',
      FOOD99_ESTABLISHMENT_ID: 'est-1',
      MARKETPLACE_AUTO_CONFIRM: 'false',
    })
    expect([...setup.connections.keys()]).toEqual(['ifood', '99food'])
    expect(setup.connections.get('ifood')!.establishmentId).toBe('est-1')
    expect(setup.connections.get('ifood')!.merchantIds).toEqual(['m1'])
    // Nomes antigos da 99Food continuam valendo e ligam o protocolo nativo.
    expect(setup.connections.get('99food')!.provider).toBeInstanceOf(Food99MarketplaceProvider)
    expect(setup.connections.get('99food')!.merchantIds).toEqual(['a', 'b'])
    expect(setup.autoConfirm).toBe(false)
  })

  it('99Food nativa com as variáveis novas e Open Delivery quando pedido', () => {
    const native = readMarketplaceSetup({
      FOOD99_ENABLED: 'true',
      FOOD99_APP_ID: 'app',
      FOOD99_APP_SECRET: 'secret',
      FOOD99_SHOP_IDS: '123',
      FOOD99_ESTABLISHMENT_ID: 'est-1',
    })
    expect(native.connections.get('99food')!.provider).toBeInstanceOf(Food99MarketplaceProvider)
    const openDelivery = readMarketplaceSetup({
      FOOD99_ENABLED: 'true',
      FOOD99_PROTOCOL: 'opendelivery',
      FOOD99_API_BASE_URL: 'https://x.test',
      FOOD99_CLIENT_ID: 'id',
      FOOD99_CLIENT_SECRET: 'secret',
      FOOD99_MERCHANT_IDS: 'a',
      FOOD99_ESTABLISHMENT_ID: 'est-1',
    })
    expect(openDelivery.connections.get('99food')!.provider).toBeInstanceOf(OpenDeliveryMarketplaceProvider)
  })
})
