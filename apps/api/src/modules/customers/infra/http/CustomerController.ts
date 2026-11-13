import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { ListCustomersUseCase } from '../../application/use-cases/ListCustomersUseCase'
import type { GetCustomerDetailsUseCase } from '../../application/use-cases/GetCustomerDetailsUseCase'
import type { CreateCustomerUseCase } from '../../application/use-cases/CreateCustomerUseCase'
import type { UpdateCustomerUseCase } from '../../application/use-cases/UpdateCustomerUseCase'
import type { DeleteCustomerUseCase } from '../../application/use-cases/DeleteCustomerUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CUSTOMER_SORT_FIELDS = ['name', 'orderCount', 'totalSpent', 'createdAt'] as const
const SORT_DIRECTIONS = ['asc', 'desc'] as const

const createSchema = z.object({
  name: z.string().min(2).max(255),
  whatsappNumber: z.string().min(10).max(20),
  phone: z.string().max(20).optional(),
  document: z.string().max(20).optional(),
  birthDate: z.string().regex(ISO_DATE, 'Use o formato AAAA-MM-DD').optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
})

const updateSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  whatsappNumber: z.string().min(10).max(20).optional(),
  phone: z.string().max(20).nullable().optional(),
  document: z.string().max(20).nullable().optional(),
  birthDate: z.string().regex(ISO_DATE, 'Use o formato AAAA-MM-DD').nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
})

export class CustomerController {
  constructor(
    private readonly listCustomersUseCase: ListCustomersUseCase,
    private readonly getCustomerDetailsUseCase: GetCustomerDetailsUseCase,
    private readonly createCustomerUseCase: CreateCustomerUseCase,
    private readonly updateCustomerUseCase: UpdateCustomerUseCase,
    private readonly deleteCustomerUseCase: DeleteCustomerUseCase
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { page, pageSize, search, sortBy, sortDirection } = request.query
    const validSortBy = CUSTOMER_SORT_FIELDS.find((field) => field === sortBy)
    const validSortDirection = SORT_DIRECTIONS.find((direction) => direction === sortDirection)
    const result = await this.listCustomersUseCase.execute({
      establishmentId: request.user.establishmentId,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      ...(search ? { search } : {}),
      ...(validSortBy ? { sortBy: validSortBy } : {}),
      ...(validSortDirection ? { sortDirection: validSortDirection } : {}),
    })
    response.json(result)
  }

  get: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const details = await this.getCustomerDetailsUseCase.execute(
      request.params['id']!,
      request.user.establishmentId
    )
    response.json(details)
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    const customer = await this.createCustomerUseCase.execute({
      establishmentId: request.user.establishmentId,
      name: parsed.data.name,
      whatsappNumber: parsed.data.whatsappNumber,
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
      ...(parsed.data.document !== undefined && { document: parsed.data.document }),
      ...(parsed.data.birthDate !== undefined && { birthDate: parsed.data.birthDate }),
      ...(parsed.data.rating !== undefined && { rating: parsed.data.rating }),
    })
    response.json(customer, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    const customer = await this.updateCustomerUseCase.execute(
      request.params['id']!,
      request.user.establishmentId,
      {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.whatsappNumber !== undefined && { whatsappNumber: parsed.data.whatsappNumber }),
        ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
        ...(parsed.data.document !== undefined && { document: parsed.data.document }),
        ...(parsed.data.birthDate !== undefined && { birthDate: parsed.data.birthDate }),
        ...(parsed.data.rating !== undefined && { rating: parsed.data.rating }),
      }
    )
    response.json(customer)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    await this.deleteCustomerUseCase.execute(request.params['id']!, request.user.establishmentId)
    response.json({ success: true })
  }
}
