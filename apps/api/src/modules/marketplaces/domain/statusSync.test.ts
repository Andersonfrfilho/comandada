import { describe, expect, it } from 'bun:test'
import { actionForStatus, actionsToSend, shouldSendAction } from './statusSync'

const platform = { deliveredBy: 'platform', type: 'delivery' }
const merchant = { deliveredBy: 'merchant', type: 'delivery' }
const pickup = { deliveredBy: 'merchant', type: 'pickup' }

describe('statusSync', () => {
  it('status do painel vira ação na plataforma', () => {
    expect(actionForStatus('in_production', platform)).toBe('startPreparation')
    expect(actionForStatus('ready', platform)).toBe('readyForPickup')
    expect(actionForStatus('in_delivery', platform)).toBeNull()
    expect(actionForStatus('in_delivery', merchant)).toBe('dispatch')
    expect(actionForStatus('completed', merchant)).toBe('delivered')
    expect(actionForStatus('completed', platform)).toBeNull()
    expect(actionForStatus('completed', pickup)).toBe('pickedUp')
    expect(actionForStatus('in_delivery', pickup)).toBeNull()
    expect(actionForStatus('received', merchant)).toBeNull()
  })

  it('só anda para a frente e nunca depois de cancelado', () => {
    expect(shouldSendAction('placed', 'startPreparation')).toBe(true)
    expect(shouldSendAction('readyForPickup', 'startPreparation')).toBe(false)
    expect(shouldSendAction('cancelled', 'readyForPickup')).toBe(false)
    expect(shouldSendAction('concluded', 'delivered')).toBe(false)
  })

  it('aceita antes e manda "pronto" antes de "saiu para entrega"', () => {
    expect(actionsToSend('placed', 'startPreparation')).toEqual(['confirm', 'startPreparation'])
    expect(actionsToSend('confirm', 'dispatch')).toEqual(['readyForPickup', 'dispatch'])
    expect(actionsToSend('readyForPickup', 'dispatch')).toEqual(['dispatch'])
    expect(actionsToSend('startPreparation', 'delivered')).toEqual(['readyForPickup', 'dispatch', 'delivered'])
    expect(actionsToSend('dispatch', 'startPreparation')).toEqual([])
  })
})
