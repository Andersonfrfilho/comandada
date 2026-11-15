/**
 * Nome e WhatsApp do restaurante vivem na tabela `establishments` (o bot e o login leem de lá). A tela
 * de Configurações mostra e grava esses dois campos como se fossem configurações; antes gravava em
 * `settings`, que ninguém lia, e a tela abria em branco.
 */
export const ESTABLISHMENT_PROFILE_KEYS = {
  name: 'establishment_name',
  whatsappNumber: 'whatsapp_number',
} as const

/** Pedido mínimo que o bot confere (`min_order_value`); os dois campos antigos da tela viram fallback. */
export const MIN_ORDER_SETTING_KEY = 'min_order_value'
export const LEGACY_MIN_ORDER_KEYS = ['minimum_delivery_order', 'min_order_amount'] as const
