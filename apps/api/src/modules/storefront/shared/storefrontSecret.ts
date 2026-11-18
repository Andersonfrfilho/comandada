/**
 * Segredo que assina o link de acompanhamento do pedido do cardápio online. Sem
 * STOREFRONT_TRACKING_SECRET usa o JWT_SECRET da API (já obrigatório em produção).
 */
export function storefrontTrackingSecret(): string {
  return process.env.STOREFRONT_TRACKING_SECRET?.trim() || process.env.JWT_SECRET?.trim() || 'change-me'
}
