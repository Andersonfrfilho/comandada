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
  },
  cashRegister: {
    alreadyOpen: 'A cash register is already open for this establishment',
    notOpen: 'No cash register is currently open',
    notFound: 'Cash register not found',
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
