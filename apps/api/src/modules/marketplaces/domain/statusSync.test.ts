import { describe, expect, it } from 'bun:test'
import { actionForStatus, shouldSendAction } from './statusSync'

describe('statusSync', () => {
  it('status do painel vira ação na plataforma', () => {
    expect(actionForStatus('in_production', 'platform')).toBe('startPreparation')
    expect(actionForStatus('ready', 'platform')).toBe('readyForPickup')
    expect(actionForStatus('in_delivery', 'platform')).toBeNull()
    expect(actionForStatus('in_delivery', 'merchant')).toBe('dispatch')
    expect(actionForStatus('completed', 'merchant')).toBe('delivered')
    expect(actionForStatus('completed', 'platform')).toBeNull()
    expect(actionForStatus('received', 'merchant')).toBeNull()
  })

  it('só anda para a frente e nunca depois de cancelado', () => {
    expect(shouldSendAction('placed', 'startPreparation')).toBe(true)
    expect(shouldSendAction('readyForPickup', 'startPreparation')).toBe(false)
    expect(shouldSendAction('cancelled', 'readyForPickup')).toBe(false)
    expect(shouldSendAction('concluded', 'delivered')).toBe(false)
  })
})
