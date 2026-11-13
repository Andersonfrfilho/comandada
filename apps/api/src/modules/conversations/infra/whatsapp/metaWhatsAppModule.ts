/**
 * Fábrica do @adatechnology/meta-whatsapp-module para o Order Hub.
 *
 * Uma instância por estabelecimento, memoizada. O pacote assume um tenant por instância — a
 * configuração da Meta e o notificador de tempo real são injetados, e nenhum evento que ele emite
 * carrega `companyId`. Uma instância única compartilhada entregaria evento de uma conversa para a
 * sala de outro estabelecimento.
 *
 * `flowEngine` fica desligado: neste projeto o bot é o workflow do n8n (`src/*.js` → `make build`),
 * e a API só registra e opera o atendimento humano.
 */

import {
  createMetaWhatsAppModule,
  type MetaWhatsAppDatabase,
  type MetaWhatsAppModule,
  type NonceStoreInterface,
  verifyWebhookChallenge,
} from '@adatechnology/meta-whatsapp-module'
import type { ObjectStorageInterface } from '@adatechnology/meta-whatsapp-contracts'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import {
  conversationDocumentsQueue,
  inboundMediaJobId,
} from '@/infra/queue/conversationDocumentsQueue'
import { CONVERSATION_DOCUMENTS_JOB } from '@/infra/queue/QueueNames.constant'
import { createConversationRealtimeNotifier } from '../realtime/ConversationRealtimeNotifier'

const NONCE_VALUE = '1'

interface MetaWhatsAppModuleRegistryParams {
  readonly db: MetaWhatsAppDatabase
  readonly cache: CacheProvider
  readonly webSocketHub: WebSocketHub
  /**
   * Ausente, a biblioteca de documentos fica desligada: o módulo não expõe `ingestInboundMedia` e
   * o anexo continua acessível só pelo proxy de mídia da Meta, enquanto a URL dela viver.
   */
  readonly objectStorage?: ObjectStorageInterface | undefined
  /**
   * Faz o canal aceitar mídia gravada no simulador (`preview-upload:<chave>`) — é o que devolve o
   * microfone ao painel. Ligado, um webhook forjado consegue ler objeto do bucket por id: só vale
   * onde o simulador já está habilitado.
   */
  readonly previewMediaEnabled?: boolean | undefined
}

export interface MetaWhatsAppModuleRegistry {
  forEstablishment(establishmentId: string): MetaWhatsAppModule
  /**
   * A verificação do `hub.challenge` acontece antes de existir tenant: a Meta chama a URL crua ao
   * registrar o webhook. Fica no registry para o token de verificação ser lido num lugar só.
   */
  verifyChallenge(query: {
    mode: string | null
    token: string | null
    challenge: string | null
  }): string
}

function toNonceStore(cache: CacheProvider): NonceStoreInterface {
  return {
    async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
      return cache.setIfNotExists(key, NONCE_VALUE, ttlSeconds)
    },
  }
}

export function createMetaWhatsAppModuleRegistry(
  params: MetaWhatsAppModuleRegistryParams
): MetaWhatsAppModuleRegistry {
  const nonceStore = toNonceStore(params.cache)
  const instances = new Map<string, MetaWhatsAppModule>()

  const config = {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    ...(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
      ? { wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID }
      : {}),
    ...(process.env.WHATSAPP_API_VERSION ? { apiVersion: process.env.WHATSAPP_API_VERSION } : {}),
  }

  return {
    forEstablishment(establishmentId: string): MetaWhatsAppModule {
      const cached = instances.get(establishmentId)
      if (cached) return cached

      const instance = createMetaWhatsAppModule({
        db: params.db,
        config,
        nonceStore,
        features: {
          flowEngine: false,
          // Sem storage o flag é ignorado pelo pacote — não há bytes para devolver.
          previewMedia: Boolean(params.previewMediaEnabled && params.objectStorage),
        },
        providers: {
          realtime: createConversationRealtimeNotifier(params.webSocketHub, establishmentId),
          ...(params.objectStorage ? { objectStorage: params.objectStorage } : {}),
        },
        // Hook próprio, e não `onMessageReceived`: aquele não roda em atendimento humano, que é
        // justamente quando o cliente manda comprovante para o atendente.
        ...(params.objectStorage
          ? {
              hooks: {
                onMediaReceived: async (media): Promise<void> => {
                  await conversationDocumentsQueue.add(
                    CONVERSATION_DOCUMENTS_JOB.INGEST_INBOUND_MEDIA,
                    {
                      companyId: media.companyId,
                      messageId: media.messageId,
                      sourceMediaId: media.sourceMediaId,
                      mimeType: media.mimeType,
                      ...(media.filename ? { filename: media.filename } : {}),
                    },
                    { jobId: inboundMediaJobId(media.companyId, media.sourceMediaId) }
                  )
                },
              },
            }
          : {}),
      })

      instances.set(establishmentId, instance)
      return instance
    },

    verifyChallenge(query): string {
      return verifyWebhookChallenge({ ...query, expectedToken: config.webhookVerifyToken })
    },
  }
}
