import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { DeliveryFeeController } from './DeliveryFeeController'

export function registerDeliveryFeeRoutes(router: Router, controller: DeliveryFeeController): void {
  router.get('/delivery-fee/rules', authenticate, authorize('settings', 'read'), controller.listRules)
  router.post('/delivery-fee/rules', authenticate, authorize('settings', 'write'), controller.createRule)
  router.put('/delivery-fee/rules/:id', authenticate, authorize('settings', 'write'), controller.updateRule)
  router.delete('/delivery-fee/rules/:id', authenticate, authorize('settings', 'write'), controller.deleteRule)

  router.get('/delivery-fee/rules/:ruleId/zones', authenticate, authorize('settings', 'read'), controller.listZones)
  router.post('/delivery-fee/rules/:ruleId/zones', authenticate, authorize('settings', 'write'), controller.createZone)
  router.put('/delivery-fee/zones/:id', authenticate, authorize('settings', 'write'), controller.updateZone)
  router.delete('/delivery-fee/zones/:id', authenticate, authorize('settings', 'write'), controller.deleteZone)
}
