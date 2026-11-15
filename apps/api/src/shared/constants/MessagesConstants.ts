export const MessagesConstants = {
  auth: {
    invalidCredentials: 'Invalid email or password',
    accountLocked: 'Account temporarily locked due to too many failed attempts',
    accountInactive: 'Account is inactive',
    tokenExpired: 'Access token expired',
    tokenInvalid: 'Invalid or malformed token',
    refreshTokenInvalid: 'Invalid or expired refresh token',
    refreshTokenReused: 'Refresh token reuse detected — session invalidated',
    passwordMustChange: 'You must change your password before continuing',
    logoutSuccess: 'Logged out successfully',
  },
  validation: {
    bodyRequired: 'Request body is required',
    invalidJson: 'Request body is not valid JSON',
    fieldRequired: (field: string) => `Field '${field}' is required`,
  },
  order: {
    notFound: 'Order not found',
    invalidStatusTransition: (from: string, to: string) =>
      `Cannot transition order from '${from}' to '${to}'`,
    alreadyCancelled: 'Order is already cancelled',
    itemWithoutProduct: 'Todo item do pedido precisa ser um produto do cardápio.',
    productNotInMenu: 'Um dos produtos não está no cardápio deste restaurante.',
    productInactive: (name: string) => `${name} está fora do cardápio no momento.`,
    changeBelowAmount: 'O valor do "troco para" é menor que o valor a pagar.',
    paymentsAboveTotal: (total: number) =>
      `Os pagamentos somam mais que o total do pedido (R$ ${total.toFixed(2).replace('.', ',')}).`,
    scheduledInPast: 'A hora agendada já passou. Escolha um horário futuro.',
  },
  cashRegister: {
    alreadyOpen: 'A cash register is already open for this establishment',
    notOpen: 'No cash register is currently open',
    notFound: 'Cash register not found',
    withdrawalAboveCash: (available: string) =>
      `A sangria é maior que o dinheiro na gaveta (R$ ${available.replace('.', ',')}). Confira o valor.`,
    paymentForCancelledOrder: 'Este pedido está cancelado. Não dá para lançar pagamento nele.',
    orderNotFound: 'Pedido não encontrado neste restaurante.',
  },
  delivery: {
    notFound: 'Delivery not found',
    alreadyAssigned: 'Order already has an active delivery',
  },
  product: {
    notFound: 'Product not found',
    inactive: 'Product is inactive and cannot be ordered',
  },
  establishment: {
    notFound: 'Establishment not found',
  },
  webhook: {
    invalidSignature: 'Invalid webhook signature',
    replayDetected: 'Duplicate request detected',
    processingError: 'Failed to process webhook payload',
  },
  generic: {
    notFound: (resource: string) => `${resource} not found`,
    forbidden: 'Access denied',
    internalError: 'An internal error occurred',
    serviceUnavailable: (service: string) => `${service} is temporarily unavailable`,
  },
} as const
