import { describe, expect, it } from 'bun:test'

import { forwardWhatsAppInbound, type FetchFunction } from './ForwardWhatsAppInboundProcessor'
import type { WhatsAppInboundJobData } from '@/infra/queue/QueueNames.constant'

const JOB: WhatsAppInboundJobData = {
  rawBody: '{"entry":[]}',
  signature: 'sha256=abc',
  messageIds: ['wamid.A'],
  receivedAt: 0,
}

function fetchSpy(status: number): { fetchFunction: FetchFunction; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchFunction: FetchFunction = async (url, init) => {
    calls.push({ url, init })
    return new Response('resposta', { status })
  }
  return { fetchFunction, calls }
}

describe('forwardWhatsAppInbound', () => {
  it('repassa ao n8n o corpo cru com a assinatura original da Meta', async () => {
    const { fetchFunction, calls } = fetchSpy(200)

    await forwardWhatsAppInbound(JOB, 'https://n8n.exemplo/webhook/routing', fetchFunction)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://n8n.exemplo/webhook/routing')
    expect(calls[0]?.init.body).toBe(JOB.rawBody)
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers['x-hub-signature-256']).toBe('sha256=abc')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('n8n respondendo erro faz o job falhar, para tentar de novo', async () => {
    const { fetchFunction } = fetchSpy(502)

    await expect(forwardWhatsAppInbound(JOB, 'https://n8n.exemplo/webhook/routing', fetchFunction)).rejects.toThrow('n8n responded 502')
  })

  it('sem URL do bot o job falha em vez de sumir', async () => {
    const { fetchFunction, calls } = fetchSpy(200)

    await expect(forwardWhatsAppInbound(JOB, undefined, fetchFunction)).rejects.toThrow('N8N_BOT_WEBHOOK_URL')
    expect(calls).toHaveLength(0)
  })
})
