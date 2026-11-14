import { describe, expect, it } from 'bun:test'

import { planQueueWorkers } from './queueWorkerPlan'

describe('planQueueWorkers', () => {
  it('no worker, o bot do WhatsApp sobe sem precisar de variável', () => {
    const plan = planQueueWorkers('worker', {}, false)
    expect(plan.whatsAppInbound).toBe(true)
    expect(plan.fiscal).toBe(false)
  })

  it('no worker, as outras filas seguem as variáveis de sempre', () => {
    const plan = planQueueWorkers('worker', { FISCAL_WORKER_ENABLED: 'true', STOCK_WORKER_ENABLED: 'true' }, true)
    expect(plan).toMatchObject({ fiscal: true, stock: true, finance: false, documentIngestion: true })
  })

  it('no worker, dá para desligar o bot do WhatsApp', () => {
    expect(planQueueWorkers('worker', { WHATSAPP_INBOUND_WORKER_ENABLED: 'false' }, false).whatsAppInbound).toBe(false)
  })

  it('na API continua como antes, e o bot do WhatsApp só com variável explícita', () => {
    const plan = planQueueWorkers('api', { FINANCE_WORKER_ENABLED: 'true' }, true)
    expect(plan).toMatchObject({ whatsAppInbound: false, finance: true, documentIngestion: true })
  })

  it('API_QUEUE_WORKERS=false tira todas as filas do processo da API', () => {
    const plan = planQueueWorkers('api', { API_QUEUE_WORKERS: 'false', FISCAL_WORKER_ENABLED: 'true' }, true)
    expect(Object.values(plan).every((enabled) => enabled === false)).toBe(true)
  })
})
