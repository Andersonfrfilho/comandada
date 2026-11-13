import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import {
  CONVERSATION_DOCUMENTS_QUEUE,
  type ConversationDocumentsJobData,
  type ConversationDocumentsJobName,
} from './QueueNames.constant'

/**
 * Copiar o anexo da Meta para o storage próprio sai do caminho do webhook: a Meta reentrega o
 * evento quando a resposta demora, e baixar arquivo dentro do handler duplicaria mensagem.
 * A URL de download da Meta expira, então a fila trabalha com poucas tentativas e backoff curto.
 */
export const conversationDocumentsQueue = new Queue<
  ConversationDocumentsJobData,
  unknown,
  ConversationDocumentsJobName
>(CONVERSATION_DOCUMENTS_QUEUE, {
  connection: queueConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400, count: 500 },
    removeOnFail: { age: 604800, count: 500 },
  },
})

/** Idempotência: o mesmo anexo reentregue pela Meta não vira dois jobs nem dois objetos. */
export function inboundMediaJobId(companyId: string, sourceMediaId: string): string {
  return `${companyId}:${sourceMediaId}`
}
