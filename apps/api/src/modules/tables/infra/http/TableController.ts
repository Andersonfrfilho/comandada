import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { ListTablesUseCase } from '../../application/use-cases/ListTablesUseCase'
import type { CreateTableUseCase } from '../../application/use-cases/CreateTableUseCase'
import type { UpdateTableUseCase } from '../../application/use-cases/UpdateTableUseCase'
import type { UpdateTablePositionUseCase } from '../../application/use-cases/UpdateTablePositionUseCase'
import type { DeleteTableUseCase } from '../../application/use-cases/DeleteTableUseCase'
import type { GroupTablesUseCase } from '../../application/use-cases/GroupTablesUseCase'
import type { UngroupTablesUseCase } from '../../application/use-cases/UngroupTablesUseCase'
import type { OpenComandaUseCase } from '../../application/use-cases/OpenComandaUseCase'
import type { CloseComandaUseCase } from '../../application/use-cases/CloseComandaUseCase'
import type { GetComandaByCodeUseCase } from '../../application/use-cases/GetComandaByCodeUseCase'
import type { ListComandasByTableUseCase } from '../../application/use-cases/ListComandasByTableUseCase'
import type { ConfirmComandaUseCase } from '../../application/use-cases/ConfirmComandaUseCase'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

const createTableSchema = z.object({
  number: z.number().int().positive(),
  capacity: z.number().int().positive().max(50),
})

const updateTableSchema = z.object({
  number: z.number().int().positive().optional(),
  capacity: z.number().int().positive().max(50).optional(),
})

const updateTablePositionSchema = z.object({
  positionX: z.number().int().min(0),
  positionY: z.number().int().min(0),
})

const groupTablesSchema = z.object({
  tableIds: z.array(z.string().uuid()).min(2),
})

const closeComandaSchema = z.object({
  status: z.enum(['closed', 'paid']),
})

const confirmComandaSchema = z.object({
  customerName: z.string().min(2).max(255),
  customerPhone: z.string().min(10).max(20),
  customerDocument: z.string().max(20).optional(),
})

export class TableController {
  constructor(
    private readonly listTablesUseCase: ListTablesUseCase,
    private readonly createTableUseCase: CreateTableUseCase,
    private readonly updateTableUseCase: UpdateTableUseCase,
    private readonly updateTablePositionUseCase: UpdateTablePositionUseCase,
    private readonly deleteTableUseCase: DeleteTableUseCase,
    private readonly groupTablesUseCase: GroupTablesUseCase,
    private readonly ungroupTablesUseCase: UngroupTablesUseCase,
    private readonly openComandaUseCase: OpenComandaUseCase,
    private readonly closeComandaUseCase: CloseComandaUseCase,
    private readonly getComandaByCodeUseCase: GetComandaByCodeUseCase,
    private readonly listComandasByTableUseCase: ListComandasByTableUseCase,
    private readonly confirmComandaUseCase: ConfirmComandaUseCase,
    private readonly comandaRepository: ComandaRepository
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const tables = await this.listTablesUseCase.execute(request.user.establishmentId)
    const openComandas = await this.comandaRepository.listOpenByEstablishment(request.user.establishmentId)
    const comandasByTable = new Map<string, typeof openComandas>()
    for (const comanda of openComandas) {
      const bucket = comandasByTable.get(comanda.tableId) ?? []
      bucket.push(comanda)
      comandasByTable.set(comanda.tableId, bucket)
    }
    response.json(
      tables.map((table) => {
        const comandas = comandasByTable.get(table.id) ?? []
        // `comanda` (singular) segue no payload como a primeira aberta — a UI
        // de grade mostra um código só; `comandas` é a lista completa.
        return { ...table, comandas, comanda: comandas[0] ?? null }
      })
    )
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = createTableSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    const table = await this.createTableUseCase.execute(
      request.user.establishmentId,
      parsed.data.number,
      parsed.data.capacity
    )
    response.json(table, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = updateTableSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    const table = await this.updateTableUseCase.execute(
      request.params['id']!,
      request.user.establishmentId,
      parsed.data
    )
    response.json(table)
  }

  updatePosition: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = updateTablePositionSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    const table = await this.updateTablePositionUseCase.execute({
      id: request.params['id']!,
      establishmentId: request.user.establishmentId,
      positionX: parsed.data.positionX,
      positionY: parsed.data.positionY,
      userId: request.user.id,
    })
    response.json(table)
  }

  listComandasByTable: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const comandas = await this.listComandasByTableUseCase.execute(
      request.params['id']!,
      request.user.establishmentId
    )
    response.json(comandas)
  }

  group: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = groupTablesSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    const group = await this.groupTablesUseCase.execute(
      request.user.establishmentId,
      parsed.data.tableIds,
      request.user.id
    )
    response.json(group, 201)
  }

  ungroup: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    await this.ungroupTablesUseCase.execute(
      request.params['groupId']!,
      request.user.establishmentId,
      request.user.id
    )
    response.json({ success: true })
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    await this.deleteTableUseCase.execute(request.params['id']!, request.user.establishmentId)
    response.json({ success: true })
  }

  openComanda: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const comanda = await this.openComandaUseCase.execute(
      request.params['id']!,
      request.user.establishmentId
    )
    response.json(comanda, 201)
  }

  closeComanda: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = closeComandaSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    const comanda = await this.closeComandaUseCase.execute(
      request.params['comandaId']!,
      request.user.establishmentId,
      parsed.data.status
    )
    response.json(comanda)
  }

  getComandaByCode: RouteHandler = async (request, response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comanda = await this.getComandaByCodeUseCase.execute(request.params['code']!) as any
    response.json({
      tableNumber: comanda.tableNumber,
      tableCapacity: comanda.tableCapacity,
      code: comanda.code,
      confirmed: !!comanda.customerName,
      customerName: comanda.customerName ?? null,
    })
  }

  confirmComanda: RouteHandler = async (request, response) => {
    const parsed = confirmComandaSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten().fieldErrors)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comanda = await this.confirmComandaUseCase.execute(request.params['code']!, parsed.data) as any
    response.json({
      tableNumber: comanda.tableNumber,
      code: comanda.code,
      customerName: comanda.customerName,
      confirmed: true,
    })
  }
}
