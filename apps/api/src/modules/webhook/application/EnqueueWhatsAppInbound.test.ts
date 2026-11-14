import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'

import { EnqueueWhatsAppInboundUseCase, type WhatsAppInboundQueue } from './EnqueueWhatsAppInbound.use-case'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { WhatsAppInboundJobData } from '@/infra/queue/QueueNames.constant'

const APP_SECRET = 'segredo-de-teste'

type AddCall = { name: string; data: WhatsAppInboundJobData; options: { jobId?: string } | undefined }

function createQueueSpy(failure?: Error): { queue: WhatsAppInboundQueue; calls: AddCall[] } {
  const calls: AddCall[] = []
  const queue = {
    add: async (name: string, data: WhatsAppInboundJobData, options?: { jobId?: string }) => {
      if (failure) throw failure
      calls.push({ name, data, options })
      return {}
    },
  } as unknown as WhatsAppInboundQueue
  return { queue, calls }
}

function sign(body: Buffer, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

function messagePayload(messageId: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [{ id: messageId, from: '5511900000001', type: 'text', text: { body: 'olá' } }] } }] }],
    }),
    'utf-8'
  )
}

describe('EnqueueWhatsAppInboundUseCase', () => {
  it('enfileira o corpo cru e a assinatura, com o id da mensagem como jobId', async () => {
    const { queue, calls } = createQueueSpy()
    const useCase = new EnqueueWhatsAppInboundUseCase(queue, APP_SECRET, () => 1000)
    const body = messagePayload('wamid.A')
    const signature = sign(body)

    const result = await useCase.execute({ rawBody: body, signature })

    expect(result).toEqual({ enqueued: true, messageIds: ['wamid.A'] })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.options?.jobId).toBe('wa-wamid.A')
    expect(calls[0]?.data).toEqual({ rawBody: body.toString('utf-8'), signature, messageIds: ['wamid.A'], receivedAt: 1000 })
  })

  it('recusa corpo sem assinatura válida da Meta', async () => {
    const { queue, calls } = createQueueSpy()
    const useCase = new EnqueueWhatsAppInboundUseCase(queue, APP_SECRET)
    const body = messagePayload('wamid.B')

    await expect(useCase.execute({ rawBody: body, signature: sign(body, 'outro-segredo') })).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(useCase.execute({ rawBody: body, signature: undefined })).rejects.toBeInstanceOf(UnauthorizedError)
    expect(calls).toHaveLength(0)
  })

  it('recusa tudo quando o app secret não está configurado', async () => {
    const { queue } = createQueueSpy()
    const useCase = new EnqueueWhatsAppInboundUseCase(queue, '')
    const body = messagePayload('wamid.C')

    await expect(useCase.execute({ rawBody: body, signature: sign(body, '') })).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('não enfileira aviso só de status (entregue, lido)', async () => {
    const { queue, calls } = createQueueSpy()
    const useCase = new EnqueueWhatsAppInboundUseCase(queue, APP_SECRET)
    const body = Buffer.from(JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'read' }] } }] }] }))

    const result = await useCase.execute({ rawBody: body, signature: sign(body) })

    expect(result.enqueued).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('corpo assinado mas que não é JSON é erro de validação', async () => {
    const { queue } = createQueueSpy()
    const useCase = new EnqueueWhatsAppInboundUseCase(queue, APP_SECRET)
    const body = Buffer.from('não é json')

    await expect(useCase.execute({ rawBody: body, signature: sign(body) })).rejects.toBeInstanceOf(ValidationError)
  })

  it('fila fora do ar propaga o erro, para a Meta reentregar', async () => {
    const { queue } = createQueueSpy(new Error('redis down'))
    const useCase = new EnqueueWhatsAppInboundUseCase(queue, APP_SECRET)
    const body = messagePayload('wamid.D')

    await expect(useCase.execute({ rawBody: body, signature: sign(body) })).rejects.toThrow('redis down')
  })
})
