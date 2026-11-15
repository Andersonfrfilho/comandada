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
    notFound: 'Entrega não encontrada',
    orderCancelled: 'Pedido cancelado',
    failureReasonRequired: 'Diga o que aconteceu para marcar a entrega como não feita',
    orderClosed: 'Este pedido já foi cancelado ou concluído',
    invalidTransition: 'Esta entrega não pode mudar para esse status agora',
    courierNotFound: 'Entregador não encontrado',
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
  staff: {
    roleAboveActor: 'Você não pode dar um cargo com mais acesso que o seu',
    memberAboveActor: 'Este funcionário tem mais acesso que você; peça a um administrador',
    cannotChangeSelf: 'Você não pode desativar nem excluir o próprio acesso',
    invalidFields: (fields: string[]) => `Confira: ${fields.join(', ')}`,
  },
  comanda: {
    notOpenOnTable: 'Esta comanda não está aberta nesta mesa',
    requiredForTableOrder: 'Abra uma comanda na mesa antes de lançar o pedido',
    alreadyClosed: 'Esta comanda já foi encerrada',
    hasOpenBalance: (amount: string) =>
      `A comanda tem ${amount} em aberto. Receba a conta ou cancele os pedidos antes de encerrar.`,
    nothingToPay: 'Não há nada a receber nesta comanda',
    cashRegisterClosed: 'Abra o caixa antes de receber a conta',
    paymentsMismatch: (paid: string, due: string) => `Os pagamentos somam ${paid}, mas a conta é ${due}`,
    changeBelowAmount: 'O "troco para" precisa ser maior ou igual ao valor pago em dinheiro',
    sameTable: 'A comanda já está nesta mesa',
    settledNote: 'Conta da mesa paga',
  },
  generic: {
    notFound: (resource: string) => `${resource} not found`,
    forbidden: 'Seu cargo não tem acesso a esta ação',
    internalError: 'An internal error occurred',
    serviceUnavailable: (service: string) => `${service} is temporarily unavailable`,
  },
} as const
