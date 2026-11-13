/**
 * Tabelas sincronizadas entre loja e nuvem, na ordem em que podem ser aplicadas (pais antes dos
 * filhos). Uma tabela fora desta lista não sai do nó onde foi escrita.
 *
 * Fora de propósito:
 *  - meta_whatsapp.* e bot_sessions: estado do WhatsApp, que só funciona com internet, na nuvem.
 */
export type SyncRole = 'loja' | 'nuvem'

export interface SyncTableConfig {
  readonly table: string
  readonly primaryKey: readonly string[]
  /** Coluna de estado em que o mais avançado vence quando os dois lados mudam ao mesmo tempo. */
  readonly state?: { readonly column: string; readonly ranks: Readonly<Record<string, number>> }
  /** Colunas numéricas em que a diferença feita de cada lado é somada (ex.: estoque). */
  readonly counters?: readonly string[]
  /** Só esse papel pode escrever; o que vier do outro vira conflito no dono. */
  readonly ownerRole?: SyncRole
}

const ID = ['id'] as const

const ORDER_STATUS_RANKS = {
  received: 1,
  in_production: 2,
  ready: 3,
  in_delivery: 4,
  picked_up: 5,
  completed: 6,
  cancelled: 6,
}

export const SYNC_TABLES: readonly SyncTableConfig[] = [
  { table: 'public.establishments', primaryKey: ID },
  { table: 'public.roles', primaryKey: ID },
  { table: 'public.permissions', primaryKey: ID },
  { table: 'public.users', primaryKey: ID },
  { table: 'public.settings', primaryKey: ID },
  { table: 'public.bot_settings', primaryKey: ID },
  { table: 'public.order_types', primaryKey: ID },
  { table: 'public.payment_types', primaryKey: ID },
  { table: 'public.fiscal_configurations', primaryKey: ID },
  { table: 'public.sections', primaryKey: ID },
  { table: 'public.categories', primaryKey: ID },
  { table: 'public.products', primaryKey: ID },
  { table: 'public.ingredients', primaryKey: ID, counters: ['stock_quantity'] },
  { table: 'public.product_ingredients', primaryKey: ID },
  { table: 'public.product_components', primaryKey: ID },
  { table: 'public.product_price_history', primaryKey: ID },
  { table: 'public.product_affinities', primaryKey: ID },
  { table: 'public.stock_batches', primaryKey: ID, counters: ['remaining_quantity'] },
  { table: 'public.customers', primaryKey: ID },
  { table: 'public.addresses', primaryKey: ID },
  { table: 'public.table_groups', primaryKey: ID },
  { table: 'public.tables', primaryKey: ID },
  {
    table: 'public.comandas',
    primaryKey: ID,
    state: { column: 'status', ranks: { open: 1, closed: 2, paid: 3 } },
  },
  { table: 'public.orders', primaryKey: ID, state: { column: 'status', ranks: ORDER_STATUS_RANKS } },
  { table: 'public.order_items', primaryKey: ID },
  { table: 'public.order_payments', primaryKey: ID },
  { table: 'public.order_status_logs', primaryKey: ID },
  {
    table: 'public.deliveries',
    primaryKey: ID,
    state: { column: 'status', ranks: { pending: 1, dispatched: 2, delivered: 3, failed: 3 } },
  },
  {
    table: 'public.order_issues',
    primaryKey: ID,
    state: { column: 'status', ranks: { open: 1, resolved: 2 } },
  },
  {
    table: 'public.order_partial_confirmations',
    primaryKey: ID,
    state: { column: 'status', ranks: { pending: 1, accepted: 2, declined: 2, superseded: 2 } },
  },
  { table: 'public.delivery_fee_rules', primaryKey: ID },
  { table: 'public.delivery_fee_zones', primaryKey: ID },
  {
    table: 'public.cash_registers',
    primaryKey: ID,
    ownerRole: 'loja',
    state: { column: 'status', ranks: { open: 1, closed: 2 } },
  },
  { table: 'public.cash_movements', primaryKey: ID, ownerRole: 'loja' },
  {
    table: 'public.fiscal_documents',
    primaryKey: ID,
    state: {
      column: 'status',
      ranks: { pending: 1, emitting: 2, rejected: 3, authorized: 4, cancelled: 5 },
    },
  },
  { table: 'public.stock_movements', primaryKey: ID },
  { table: 'public.expenses', primaryKey: ID },
  { table: 'public.monthly_accounts', primaryKey: ID },
  { table: 'public.audit_logs', primaryKey: ID },
  { table: 'public.table_reservations', primaryKey: ID },
  { table: 'public.conversation_sessions', primaryKey: ID },
  { table: 'public.conversation_messages', primaryKey: ID },
  { table: 'scheduling.services', primaryKey: ID },
  { table: 'scheduling.resources', primaryKey: ID },
  { table: 'scheduling.resource_services', primaryKey: ['resource_id', 'service_id'] },
  { table: 'scheduling.availability_rules', primaryKey: ID },
  { table: 'scheduling.availability_exceptions', primaryKey: ID },
  { table: 'scheduling.bookings', primaryKey: ID },
  { table: 'scheduling.booking_slots', primaryKey: ID },
  { table: 'scheduling.booking_participants', primaryKey: ID },
]
