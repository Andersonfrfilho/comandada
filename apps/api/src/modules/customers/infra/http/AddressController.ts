import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { ListAddressesUseCase } from '../../application/use-cases/ListAddressesUseCase'
import type { CreateAddressUseCase } from '../../application/use-cases/CreateAddressUseCase'
import type { UpdateAddressUseCase } from '../../application/use-cases/UpdateAddressUseCase'
import type { DeleteAddressUseCase } from '../../application/use-cases/DeleteAddressUseCase'
import type { SetDefaultAddressUseCase } from '../../application/use-cases/SetDefaultAddressUseCase'
import { AppError, UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { NominatimProvider } from '@/shared/providers/NominatimProvider'
import { ViaCepProvider } from '@/shared/providers/ViaCepProvider'

const createSchema = z.object({
  street: z.string().min(2).max(255),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  state: z.string().length(2),
  zip: z.string().max(10).optional(),
  label: z.string().max(50).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  geocode: z.boolean().optional(),
})

const updateSchema = z.object({
  street: z.string().min(2).max(255).optional(),
  number: z.string().min(1).max(20).optional(),
  complement: z.string().max(100).nullable().optional(),
  neighborhood: z.string().min(1).max(100).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().length(2).optional(),
  zip: z.string().max(10).nullable().optional(),
  label: z.string().max(50).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  geocode: z.boolean().optional(),
})

export class AddressController {
  constructor(
    private readonly listAddressesUseCase: ListAddressesUseCase,
    private readonly createAddressUseCase: CreateAddressUseCase,
    private readonly updateAddressUseCase: UpdateAddressUseCase,
    private readonly deleteAddressUseCase: DeleteAddressUseCase,
    private readonly setDefaultAddressUseCase: SetDefaultAddressUseCase,
    private readonly geocodingProvider: NominatimProvider = new NominatimProvider(),
    private readonly viaCepProvider: ViaCepProvider = new ViaCepProvider()
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const customerId = request.params['customerId']!
    const addresses = await this.listAddressesUseCase.execute(customerId)
    response.json(addresses)
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const customerId = request.params['customerId']!

    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)

    let lat = parsed.data.lat
    let lng = parsed.data.lng

    if (parsed.data.geocode && (!lat || !lng)) {
      const result = await this.tryGeocode(parsed.data)
      if (result) {
        lat = result.lat
        lng = result.lng
      }
    }

    const input: Record<string, unknown> = {
      street: parsed.data.street,
      number: parsed.data.number,
      neighborhood: parsed.data.neighborhood,
      city: parsed.data.city,
      state: parsed.data.state,
    }
    if (parsed.data.complement !== undefined) input.complement = parsed.data.complement
    if (parsed.data.zip !== undefined) input.zip = parsed.data.zip
    if (parsed.data.label !== undefined) input.label = parsed.data.label
    if (lat !== undefined) input.lat = lat
    if (lng !== undefined) input.lng = lng

    const address = await this.createAddressUseCase.execute(customerId, input as never)
    response.json(address, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const customerId = request.params['customerId']!
    const addressId = request.params['addressId']!

    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)

    const input: Record<string, unknown> = {}
    const d = parsed.data
    if (d.street !== undefined) input.street = d.street
    if (d.number !== undefined) input.number = d.number
    if (d.complement !== undefined) input.complement = d.complement
    if (d.neighborhood !== undefined) input.neighborhood = d.neighborhood
    if (d.city !== undefined) input.city = d.city
    if (d.state !== undefined) input.state = d.state
    if (d.zip !== undefined) input.zip = d.zip
    if (d.label !== undefined) input.label = d.label
    if (d.lat !== undefined) input.lat = d.lat
    if (d.lng !== undefined) input.lng = d.lng
    if (d.geocode && (d.lat == null || d.lng == null) && d.street && d.number && d.neighborhood && d.city && d.state) {
      const result = await this.tryGeocode({ street: d.street, number: d.number, neighborhood: d.neighborhood, city: d.city, state: d.state })
      if (result) {
        input.lat = result.lat
        input.lng = result.lng
      }
    }

    const address = await this.updateAddressUseCase.execute(addressId, customerId, input as never)
    response.json(address)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const customerId = request.params['customerId']!
    const addressId = request.params['addressId']!
    await this.deleteAddressUseCase.execute(addressId, customerId)
    response.json({ success: true })
  }

  setDefault: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const customerId = request.params['customerId']!
    const addressId = request.params['addressId']!
    await this.setDefaultAddressUseCase.execute(addressId, customerId)
    response.json({ success: true })
  }

  lookupCep: RouteHandler = async (request, response) => {
    const cep = request.params['cep']!
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) {
      response.json(null)
      return
    }
    try {
      response.json(await this.viaCepProvider.lookup(clean))
    } catch (error) {
      // Serviço de CEP fora do ar não é "CEP não encontrado": a tela pede para digitar o endereço.
      console.warn('[Addresses] CEP lookup failed', error instanceof Error ? error.message : error)
      throw new AppError('A consulta de CEP está fora do ar agora. Preencha o endereço à mão.', 'cep_unavailable', 503)
    }
  }

  /**
   * Localização no mapa é um extra: se o serviço de mapa cair ou não achar, o endereço salva sem
   * coordenadas em vez de dar erro 500 (a entrega usa o texto do endereço).
   */
  private async tryGeocode(address: { street: string; number: string; neighborhood: string; city: string; state: string }) {
    const query = `${address.street} ${address.number}, ${address.neighborhood}, ${address.city} - ${address.state}`
    try {
      return await this.geocodingProvider.search(query)
    } catch (error) {
      console.warn('[Addresses] geocoding failed', error instanceof Error ? error.message : error)
      return null
    }
  }
}
