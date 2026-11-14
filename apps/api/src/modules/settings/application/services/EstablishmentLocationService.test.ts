import { describe, expect, mock, test } from 'bun:test'
import { EstablishmentLocationService } from './EstablishmentLocationService'
import { geocodingQuery } from '../../shared/establishmentLocation.constant'

function fakeDatabase() {
  const saved: Array<Record<string, unknown>> = []
  const transaction = {
    delete: () => ({ where: async () => undefined }),
    insert: () => ({ values: async (rows: Array<Record<string, unknown>>) => void saved.push(...rows) }),
  }
  const db = { transaction: async (work: (tx: typeof transaction) => Promise<void>) => work(transaction) }
  return { db, saved }
}

const ADDRESS = 'Av. Presidente Vargas, 1343 — Cidade Nova'

describe('EstablishmentLocationService', () => {
  test('geocodifica endereço + cidade uma vez e salva as coordenadas', async () => {
    const { db, saved } = fakeDatabase()
    const search = mock(async () => ({ lat: -20.53, lng: -47.4 }))
    // @ts-expect-error banco falso só com o que o serviço usa
    const service = new EstablishmentLocationService(db, { search })
    const result = await service.resolve('est-1', { establishment_address: ADDRESS, establishment_city: 'Franca - SP' })
    expect(result).toEqual({ latitude: -20.53, longitude: -47.4 })
    expect(search).toHaveBeenCalledWith('Av. Presidente Vargas, 1343, Cidade Nova, Franca - SP')
    expect(saved.map((row) => row['key']).sort()).toEqual(['establishment_geocoded_for', 'establishment_lat', 'establishment_lng'])
  })

  test('coordenadas salvas para o mesmo endereço não chamam o geocoder', async () => {
    const { db } = fakeDatabase()
    const search = mock(async () => ({ lat: 1, lng: 1 }))
    // @ts-expect-error banco falso
    const service = new EstablishmentLocationService(db, { search })
    const config = {
      establishment_address: ADDRESS,
      establishment_lat: '-20.5',
      establishment_lng: '-47.4',
      establishment_geocoded_for: geocodingQuery(ADDRESS, ''),
    }
    expect(await service.resolve('est-1', config)).toEqual({ latitude: -20.5, longitude: -47.4 })
    expect(search).not.toHaveBeenCalled()
  })

  test('coordenadas digitadas no painel valem mesmo com endereço novo', async () => {
    const { db } = fakeDatabase()
    const search = mock(async () => ({ lat: 1, lng: 1 }))
    // @ts-expect-error banco falso
    const service = new EstablishmentLocationService(db, { search })
    const config = { establishment_address: 'Outro endereço', establishment_lat: '-20.5', establishment_lng: '-47.4' }
    expect(await service.resolve('est-1', config)).toEqual({ latitude: -20.5, longitude: -47.4 })
    expect(search).not.toHaveBeenCalled()
  })

  test('endereço não encontrado não é consultado de novo na mesma hora', async () => {
    const { db, saved } = fakeDatabase()
    const search = mock(async () => null)
    // @ts-expect-error banco falso
    const service = new EstablishmentLocationService(db, { search })
    const config = { establishment_address: 'Lugar nenhum' }
    expect(await service.resolve('est-1', config)).toBeNull()
    expect(await service.resolve('est-1', config)).toBeNull()
    expect(search).toHaveBeenCalledTimes(1)
    expect(saved).toHaveLength(0)
  })
})
