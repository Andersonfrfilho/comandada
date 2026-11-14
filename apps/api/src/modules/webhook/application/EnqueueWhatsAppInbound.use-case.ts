/**
 * Entrada das mensagens do WhatsApp pela API, no padrão dos outros bots: confere a assinatura da
 * Meta, põe o corpo cru na fila e responde rápido. Quem leva a mensagem ao bot (n8n) é o serviço
 * worker; se o n8n estiver fora do ar, o job espera e tenta de novo em vez de a mensagem sumir.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Queue } from 'bullmq'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import {
  WHATSAPP_INBOUND_JOB,
  type WhatsAppInboundJobData,
  type WhatsAppInboundJobName,
} from '@/infra/queue/QueueNames.constant'
import { WHATSAPP_INBOUND_JOB_ID_PREFIX } from '../shared/WhatsAppInbound.constant'

export type WhatsAppInboundQueue = Pick<
  Queue<WhatsAppInboundJobData, unknown, WhatsAppInboundJobName>,
  'add'
>

export interface EnqueueWhatsAppInboundInput {
  rawBody: Buffer
  signature: string | undefined
}

export interface EnqueueWhatsAppInboundResult {
  enqueued: boolean
  messageIds: string[]
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ id?: unknown }>
      }
    }>
  }>
}

export function isValidMetaSignature(rawBody: Buffer, signature: string | undefined, appSecret: string): boolean {
  if (!appSecret || !signature?.startsWith('sha256=')) return false
  const received = Buffer.from(signature.slice('sha256='.length), 'hex')
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  return received.length === expected.length && timingSafeEqual(received, expected)
}

function parsePayload(rawBody: Buffer): MetaWebhookPayload {
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf-8'))
    if (parsed && typeof parsed === 'object') return parsed as MetaWebhookPayload
  } catch {
    // cai no erro abaixo
  }
  throw new ValidationError('invalid_webhook_payload')
}

function collectMessageIds(payload: MetaWebhookPayload): string[] {
  const messageIds: string[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (typeof message.id === 'string' && message.id) messageIds.push(message.id)
      }
    }
  }
  return messageIds
}

export class EnqueueWhatsAppInboundUseCase {
  constructor(
    private readonly queue: WhatsAppInboundQueue,
    private readonly appSecret: string,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: EnqueueWhatsAppInboundInput): Promise<EnqueueWhatsAppInboundResult> {
    if (!isValidMetaSignature(input.rawBody, input.signature, this.appSecret)) {
      throw new UnauthorizedError('invalid_webhook_signature')
    }

    const messageIds = collectMessageIds(parsePayload(input.rawBody))

    // Só status (enviado, entregue, lido): o bot não faz nada com eles.
    if (messageIds.length === 0) return { enqueued: false, messageIds }

    await this.queue.add(
      WHATSAPP_INBOUND_JOB.FORWARD_TO_BOT,
      {
        rawBody: input.rawBody.toString('utf-8'),
        signature: input.signature ?? '',
        messageIds,
        receivedAt: this.now(),
      },
      { jobId: `${WHATSAPP_INBOUND_JOB_ID_PREFIX}${messageIds[0]}` }
    )

    return { enqueued: true, messageIds }
  }
}
