import { eq, and, inArray, isNull, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { NewOrder } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { canMoveManually, canTransitionTo } from '../../domain/entities/Order'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { OrderStatus } from '@/shared/types'
import type { TriggerFiscalEmissionUseCase } from '@/modules/fiscal/application/use-cases/TriggerFiscalEmissionUseCase'
import type { NotifyOrderStatusUseCase } from './NotifyOrderStatusUseCase'
import type { RecordOrderPaymentsUseCase } from '@/modules/cashier/application/use-cases/RecordOrderPaymentsUseCase'
import type { DeductStockForOrderUseCase } from '@/modules/products/application/use-cases/DeductStockForOrderUseCase'
import type { RestoreStockForOrderUseCase } from '@/modules/products/application/use-cases/RestoreStockForOrderUseCase'

type Database = NodePgDatabase<typeof schema>

export interface UpdateStatusInput {
  orderId: string
  establishmentId: string
  newStatus: OrderStatus
  cancellationReason?: string | undefined
  userId?: string | undefined
  /** Mudança manual pelo detalhe do pedido: aceita voltar ou pular etapas. */
  manual?: boolean | undefined
  /** Motivo escrito pela equipe; vai para o histórico de status. */
  note?: string | undefined
}

export const MANUAL_STATUS_NOTE = 'Alterado manualmente no painel'

// Status em que a comida já foi feita: se o pedido pulou a produção, a baixa entra aqui.
const PRODUCED_STATUSES: readonly OrderStatus[] = ['ready', 'in_delivery', 'picked_up', 'completed']

// Entrega acompanha o pedido quando a mudança vem do painel ou da cozinha: concluído não fica
// "pendente" em Entregas, cancelado sai da fila e reaberto volta para ela.
type DeliveryStatusValue = (typeof schema.deliveryStatusEnum.enumValues)[number]
const DELIVERY_FOLLOWS_ORDER: Partial<Record<OrderStatus, { status: DeliveryStatusValue; from: DeliveryStatusValue[] }>> = {
  in_delivery: { status: 'dispatched', from: ['pending'] },
  completed: { status: 'delivered', from: ['pending', 'dispatched'] },
  cancelled: { status: 'failed', from: ['pending', 'dispatched'] },
  received: { status: 'pending', from: ['dispatched', 'delivered', 'failed'] },
  in_production: { status: 'pending', from: ['dispatched', 'delivered', 'failed'] },
  ready: { status: 'pending', from: ['dispatched', 'delivered', 'failed'] },
}

export class UpdateOrderStatusUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub,
    private readonly triggerFiscal?: TriggerFiscalEmissionUseCase,
    private readonly deductStock?: DeductStockForOrderUseCase,
    private readonly notifyCustomer?: Pick<NotifyOrderStatusUseCase, 'execute'>,
    private readonly recordPayments?: Pick<RecordOrderPaymentsUseCase, 'execute'>,
    // Cancelado com Pix em aberto: cancela a cobrança no provedor (pagamentos). Falha não desfaz o cancelamento.
    private readonly onCancelled?: (order: schema.Order) => Promise<unknown>,
    // Cancelado: devolve ao estoque o que a receita tinha baixado.
    private readonly restoreStock?: Pick<RestoreStockForOrderUseCase, 'execute'>
  ) {}

  async execute(input: UpdateStatusInput) {
    const order = await this.db.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, input.orderId),
        eq(schema.orders.establishmentId, input.establishmentId)
      ),
    })

    if (!order) throw new NotFoundError('Order')

    const isNaturalStep = canTransitionTo(order.status, input.newStatus)
    const allowed = isNaturalStep || (input.manual === true && canMoveManually(order.status, input.newStatus))
    if (!allowed) {
      throw new UnprocessableError(
        MessagesConstants.order.invalidStatusTransition(order.status, input.newStatus)
      )
    }

    // Baixa de estoque bloqueia a transição quando o produto não permite saldo negativo —
    // é aqui que o pedido efetivamente começa a consumir receita.
    if (input.newStatus === 'in_production' && this.deductStock) {
      await this.deductStock.execute({
        orderId: input.orderId,
        establishmentId: input.establishmentId,
        ...(input.userId ? { userId: input.userId } : {}),
      })
    }

    // Pulou a produção (ex.: Recebido → Concluído): a baixa não pode ficar de fora. Já baixado, não faz nada.
    if (PRODUCED_STATUSES.includes(input.newStatus) && this.deductStock) {
      await this.deductStock.execute({
        orderId: input.orderId,
        establishmentId: input.establishmentId,
        allowShortage: true,
        ...(input.userId ? { userId: input.userId } : {}),
      })
    }

    const now = new Date()
    const updateValues: Partial<NewOrder> = { status: input.newStatus }

    if (input.newStatus === 'in_production') updateValues.productionStartedAt = now
    else if (input.newStatus === 'ready') updateValues.readyAt = now
    else if (input.newStatus === 'in_delivery') updateValues.dispatchedAt = now
    else if (input.newStatus === 'completed') updateValues.completedAt = now
    else if (input.newStatus === 'cancelled') {
      updateValues.cancelledAt = now
      if (input.cancellationReason) updateValues.cancellationReason = input.cancellationReason
    }
    // Reaberto: deixa de contar como cancelado.
    if (order.status === 'cancelled' && input.newStatus !== 'cancelled') {
      updateValues.cancelledAt = null
      updateValues.cancellationReason = null
    }

    const [updated] = await this.db
      .update(schema.orders)
      .set(updateValues)
      .where(
        and(
          eq(schema.orders.id, input.orderId),
          eq(schema.orders.establishmentId, input.establishmentId)
        )
      )
      .returning()

    await this.stampItemPreparation(input.orderId, input.newStatus, now)
    await this.syncDelivery(input, now)

    if (input.newStatus === 'cancelled' && this.restoreStock) {
      await this.restoreStock
        .execute({ orderId: input.orderId, establishmentId: input.establishmentId, userId: input.userId })
        .catch((error: unknown) =>
          console.error('[Orders] stock return on cancel failed', error instanceof Error ? error.message : error)
        )
    }

    if (input.newStatus === 'cancelled' && this.onCancelled && updated) {
      await this.onCancelled(updated).catch((error: unknown) =>
        console.error('[Orders] payment release on cancel failed', error instanceof Error ? error.message : error)
      )
    }

    // Histórico: quem mudou, de qual status para qual e quando.
    await this.db.insert(schema.orderStatusLogs).values({
      orderId: input.orderId,
      establishmentId: input.establishmentId,
      status: input.newStatus,
      previousStatus: order.status,
      note: statusLogNote(input, isNaturalStep),
      changedByUserId: input.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.ORDER_STATUS_CHANGED, {
      orderId: input.orderId,
      previousStatus: order.status,
      newStatus: input.newStatus,
      // O app do garçom avisa "pedido da mesa pronto" sem ter que buscar o pedido de novo.
      number: order.number ?? null,
      type: order.type,
      tableId: order.tableId ?? null,
      comandaId: order.comandaId ?? null,
    })

    // Fire-and-forget: a fiscal hiccup must never block the order status change.
    // Concluído de novo depois de uma correção manual não emite outra nota.
    const firstCompletion = !order.completedAt
    if (input.newStatus === 'completed' && firstCompletion && this.triggerFiscal) {
      this.triggerFiscal
        .execute({ orderId: input.orderId, establishmentId: input.establishmentId, event: 'on_completed' })
        .catch((error) => console.error('[Fiscal] trigger on_completed failed', error))
    }

    // Pago na entrega/retirada: entra no caixa ao concluir. Sem caixa aberto o pedido conclui mesmo assim.
    if (input.newStatus === 'completed' && this.recordPayments) {
      await this.recordPayments
        .execute({ orderId: input.orderId, establishmentId: input.establishmentId })
        .catch((error: unknown) => console.error('[Cashier] order payments not recorded:', error instanceof Error ? error.message : error))
    }

    // Fire-and-forget too: a WhatsApp outage must not undo what the kitchen just did.
    // Correção manual (voltar, pular) não manda mensagem: o cliente não precisa ver o vai e volta.
    // Cancelamento sempre avisa.
    if (this.notifyCustomer && input.userId && (isNaturalStep || input.newStatus === 'cancelled')) {
      this.notifyCustomer
        .execute({ orderId: input.orderId, establishmentId: input.establishmentId, newStatus: input.newStatus, agentUserId: input.userId })
        .catch((error) => console.error('[Orders] customer status notification failed', error instanceof Error ? error.message : error))
    }

    return updated!
  }

  private async syncDelivery(input: UpdateStatusInput, now: Date): Promise<void> {
    const follow = DELIVERY_FOLLOWS_ORDER[input.newStatus]
    if (!follow) return
    await this.db
      .update(schema.deliveries)
      .set({
        status: follow.status,
        ...(follow.status === 'dispatched' && { dispatchedAt: now }),
        ...(follow.status === 'delivered' && { deliveredAt: now }),
        ...(follow.status === 'failed' && { failedAt: now, notes: MessagesConstants.delivery.orderCancelled }),
        ...(follow.status === 'pending' && { dispatchedAt: null, deliveredAt: null, failedAt: null }),
      })
      .where(
        and(
          eq(schema.deliveries.orderId, input.orderId),
          eq(schema.deliveries.establishmentId, input.establishmentId),
          inArray(schema.deliveries.status, follow.from)
        )
      )
  }

  /**
   * O tempo de preparo real é medido por item, não pelo pedido — um pedido com
   * refrigerante e marmita atribuía a mesma duração aos dois. Avançar o pedido
   * inteiro continua carimbando todos os itens que ainda não foram marcados na
   * cozinha, para que nenhum item fique sem medição.
   */
  private async stampItemPreparation(orderId: string, newStatus: OrderStatus, now: Date): Promise<void> {
    if (newStatus === 'in_production') {
      await this.db
        .update(schema.orderItems)
        .set({ productionStartedAt: now })
        .where(and(eq(schema.orderItems.orderId, orderId), isNull(schema.orderItems.productionStartedAt)))
      return
    }

    if (newStatus === 'ready') {
      await this.db
        .update(schema.orderItems)
        .set({ readyAt: now, productionStartedAt: sql`coalesce(${schema.orderItems.productionStartedAt}, ${now})` })
        .where(and(eq(schema.orderItems.orderId, orderId), isNull(schema.orderItems.readyAt)))
    }
  }
}

export function statusLogNote(input: UpdateStatusInput, isNaturalStep: boolean): string | null {
  const reason = input.newStatus === 'cancelled' ? input.cancellationReason ?? input.note : input.note
  if (isNaturalStep) return reason ?? null
  return reason ? `${MANUAL_STATUS_NOTE}: ${reason}` : MANUAL_STATUS_NOTE
}
