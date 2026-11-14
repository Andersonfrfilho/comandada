import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import {
  WHATSAPP_INBOUND_QUEUE,
  type WhatsAppInboundJobData,
  type WhatsAppInboundJobName,
} from './QueueNames.constant'

// 8 tentativas com backoff exponencial a partir de 3 s cobrem ~13 min de n8n fora do ar (deploy,
// reinício). O job concluído fica 24 h: o jobId é o id da mensagem da Meta, então a mesma
// mensagem reentregue nesse prazo não vira um segundo job.
export const whatsAppInboundQueue = new Queue<WhatsAppInboundJobData, unknown, WhatsAppInboundJobName>(
  WHATSAPP_INBOUND_QUEUE,
  {
    connection: queueConnection as ConnectionOptions,
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { age: 86400, count: 2000 },
      removeOnFail: { age: 604800, count: 2000 },
    },
  }
)
