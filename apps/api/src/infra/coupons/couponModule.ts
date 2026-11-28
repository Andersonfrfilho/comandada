import { createCouponModule, type CouponModule } from '@adatechnology/coupon-module'

import { db } from '@/infra/database/connection'
import { COUPON_ADMIN_SCOPE } from '@/infra/modules/moduleScopes.constant'

// O módulo grava instantes e não formata data: o fuso do restaurante (AGENDA_TIMEZONE) fica nas telas.
export const couponModule: CouponModule = createCouponModule({
  db,
  config: { adminScopes: [COUPON_ADMIN_SCOPE] },
  providers: { clock: { now: () => new Date() } },
})
