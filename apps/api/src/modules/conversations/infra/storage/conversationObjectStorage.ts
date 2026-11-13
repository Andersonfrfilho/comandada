/**
 * Ponte entre o `ObjectStorageInterface` do meta-whatsapp-module e o
 * `@adatechnology/object-storage-provider`. Os dois não falam a mesma língua: o módulo pede
 * `upload({ buffer, mimeType, key }) -> { uploadId }` e o provider é endereçado por bucket + key,
 * com `sha256` e `contentLength` obrigatórios.
 *
 * O `uploadId` guardado pelo módulo é a própria key — o download dispensa tabela de tradução, e
 * reingestão da mesma mídia cai na mesma key em vez de duplicar o objeto.
 */

import { createHash } from 'node:crypto'
import type { ObjectStorageInterface } from '@adatechnology/meta-whatsapp-contracts'
import {
  createObjectStorageProvider,
  type ObjectStorageProvider,
} from '@adatechnology/object-storage-provider'
import { loadStorageEnvironment } from '@/infra/config/storageEnvironment'

/** Storage que sabe LER de volta — é o que habilita reenviar um anexo e montar zip. */
type ReadableObjectStorage = ObjectStorageInterface & {
  getObject: NonNullable<ObjectStorageInterface['getObject']>
}

export interface ConversationObjectStorage {
  readonly forModule: ReadableObjectStorage
  readonly provider: ObjectStorageProvider
}

/**
 * Junta o stream num Buffer. Anexo de WhatsApp cabe em memória com folga (a Meta corta em 16MB, e
 * `STORAGE_MAX_OBJECT_SIZE_BYTES` é validado à parte).
 */
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  return Buffer.concat(chunks)
}

export function createConversationObjectStorage(): ConversationObjectStorage {
  const environment = loadStorageEnvironment()

  function buildProvider(endpoint: string): ObjectStorageProvider {
    return createObjectStorageProvider({
      endpoint: new URL(endpoint),
      region: environment.STORAGE_REGION,
      accessKeyId: environment.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: environment.STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: environment.STORAGE_FORCE_PATH_STYLE,
      healthCheckBucket: environment.STORAGE_BUCKET,
      maxObjectSizeBytes: environment.STORAGE_MAX_OBJECT_SIZE_BYTES,
    })
  }

  const provider = buildProvider(environment.STORAGE_ENDPOINT)
  const signingProvider = environment.STORAGE_PUBLIC_ENDPOINT
    ? buildProvider(environment.STORAGE_PUBLIC_ENDPOINT)
    : provider

  const forModule: ReadableObjectStorage = {
    async upload({ buffer, mimeType, key }) {
      await provider.put({
        bucket: environment.STORAGE_BUCKET,
        key,
        body: new Uint8Array(buffer),
        contentLength: buffer.length,
        contentType: mimeType,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        mode: 'create-only',
      })

      return { uploadId: key }
    },

    async delete(uploadId) {
      await provider.delete({ bucket: environment.STORAGE_BUCKET, key: uploadId })
    },

    async getObject(uploadId) {
      const stream = await provider.get({ bucket: environment.STORAGE_BUCKET, key: uploadId })
      return collectStream(stream)
    },

    async getDownloadUrl(uploadId, options) {
      const url = await signingProvider.createSignedDownload({
        bucket: environment.STORAGE_BUCKET,
        key: uploadId,
        expiresInSeconds: options?.expiresInSeconds ?? environment.STORAGE_DOWNLOAD_URL_TTL_SECONDS,
        ...(options?.disposition ? { disposition: options.disposition } : {}),
        ...(options?.filename ? { filename: options.filename } : {}),
      })

      return url.toString()
    },
  }

  return { forModule, provider }
}
