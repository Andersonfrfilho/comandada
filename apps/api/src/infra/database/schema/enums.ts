import { pgEnum } from 'drizzle-orm/pg-core'

export const orderStatusEnum = pgEnum('order_status', [
  'received',
  'in_production',
  'ready',
  'in_delivery',
  'picked_up',
  'completed',
  'cancelled',
])

export const orderTypeEnum = pgEnum('order_type', ['delivery', 'pickup', 'table'])

export const orderChannelEnum = pgEnum('order_channel', ['whatsapp', 'ifood', 'manual'])

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'dispatched',
  'delivered',
  'failed',
])

export const cashRegisterStatusEnum = pgEnum('cash_register_status', ['open', 'closed'])

export const cashMovementTypeEnum = pgEnum('cash_movement_type', [
  'payment',
  'withdrawal',
  'supply',
])

export const paymentMethodEnum = pgEnum('payment_method', [
  'pix',
  'card_credit',
  'card_debit',
  'cash',
  'voucher',
])

export const tableStatusEnum = pgEnum('table_status', ['available', 'occupied', 'reserved'])

export const comandaStatusEnum = pgEnum('comanda_status', ['open', 'closed', 'paid'])

export const fiscalModelEnum = pgEnum('fiscal_model', ['sat', 'nfce', 'nfe', 'none'])

export const fiscalDocumentStatusEnum = pgEnum('fiscal_document_status', [
  'pending',
  'emitting',
  'authorized',
  'rejected',
  'cancelled',
])
