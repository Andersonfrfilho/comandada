/**
 * Contato de seed com um arquivo de cada tipo que a Meta aceita.
 *
 * Faz o mesmo que a ingestão faria depois do webhook — sobe o binário no storage, referencia o
 * `uploadId` no payload da mensagem e linka o documento na conversa —, só que sem passar pela Meta.
 * São esses três passos que fazem o contato se comportar como cliente de verdade: a bolha carrega a
 * mídia, o painel de arquivos lista e a tela de Documentos encontra.
 *
 * É contato, e não tela de preview separada: quem quer ver como um `.xlsx` ou um áudio aparecem abre
 * a conversa na inbox, igual abriria a de um cliente — nada de rota que só existe em dev e diverge
 * da tela real na primeira mudança.
 *
 * Os bytes em `media-samples/` são arquivos mínimos porém legítimos. Placeholder de texto rotulado
 * `application/pdf` faria o leitor recusar o arquivo, e o ponto do contato é poder ABRIR cada tipo.
 *
 * Idempotente: a key do objeto e o `waMessageId` derivam do índice, então rodar de novo reaproveita
 * o mesmo objeto e não duplica mensagem.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DocumentRepository,
  LogMessageUseCase,
  MessageRepository,
  SessionRepository,
  type MetaWhatsAppDatabase,
} from '@adatechnology/meta-whatsapp-module'

import { isStorageEnabled } from '@/infra/config/storageEnvironment'
import { createConversationObjectStorage } from '@/modules/conversations/infra/storage/conversationObjectStorage'
import { db } from '../connection'

const SEED_NUMBER = '5511900000042'
const START_STATE = 'idle'
const SAMPLES_DIRECTORY = join(__dirname, 'media-samples')

type MediaSeedItem = {
  /** Arquivo em `media-samples/`. */
  readonly sample: string
  readonly mimeType: string
  /** Ausente para imagem, áudio, vídeo e sticker: a Meta só manda nome em `document`. */
  readonly filename?: string
  /** Espécie da mídia no payload da Meta — decide como a bolha é desenhada. */
  readonly kind: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  readonly caption?: string
}

const MEDIA_SEED_ITEMS: readonly MediaSeedItem[] = [
  { sample: 'tiny.pdf', mimeType: 'application/pdf', filename: 'comprovante-pix.pdf', kind: 'document' },
  {
    sample: 'tiny.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: 'cardapio-evento.docx',
    kind: 'document',
  },
  {
    sample: 'tiny.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'pedido-empresa.xlsx',
    kind: 'document',
  },
  { sample: 'tiny.txt', mimeType: 'text/plain', filename: 'lista-do-buffet.txt', kind: 'document' },
  { sample: 'tiny.csv', mimeType: 'text/csv', filename: 'convidados.csv', kind: 'document' },
  { sample: 'tiny.zip', mimeType: 'application/zip', filename: 'comprovantes.zip', kind: 'document' },
  { sample: 'tiny.jpg', mimeType: 'image/jpeg', filename: 'foto-do-recibo.jpg', kind: 'document' },

  // Sem nome de arquivo daqui para baixo — como a Meta entrega. O rótulo na lista vira o id da
  // mídia, e é o mimeType que decide o ícone.
  { sample: 'tiny.png', mimeType: 'image/png', kind: 'image', caption: 'foto da mesa' },
  { sample: 'tiny.jpg', mimeType: 'image/jpeg', kind: 'image' },
  { sample: 'tiny.webp', mimeType: 'image/webp', kind: 'sticker' },
  { sample: 'tiny.mp4', mimeType: 'video/mp4', kind: 'video' },
  { sample: 'tiny.ogg', mimeType: 'audio/ogg; codecs=opus', kind: 'audio' },
  { sample: 'tiny.m4a', mimeType: 'audio/mp4', kind: 'audio' },
  { sample: 'tiny.aac', mimeType: 'audio/aac', kind: 'audio' },
  { sample: 'tiny.mp3', mimeType: 'audio/mpeg', filename: 'audio-do-anuncio.mp3', kind: 'document' },
]

/** Id da mídia na Meta, determinístico: rodar o seed de novo reaproveita o mesmo objeto. */
function mediaSeedId(index: number): string {
  return `seed-media-${String(index).padStart(2, '0')}`
}

function storageKeyFor(companyId: string, mediaId: string): string {
  return `meta-whatsapp/${companyId}/inbound/${mediaId}`
}

/** O payload da Meta para a espécie, com o que a ingestão acrescenta depois de copiar o binário. */
function mediaPayload(
  item: MediaSeedItem,
  mediaId: string,
  uploadId: string,
  sizeBytes: number
): Record<string, unknown> {
  const media: Record<string, unknown> = { id: mediaId, mime_type: item.mimeType }
  if (item.filename) media['filename'] = item.filename
  if (item.caption) media['caption'] = item.caption

  return {
    [item.kind]: media,
    uploadId,
    sourceMediaId: mediaId,
    mimeType: item.mimeType,
    sizeBytes,
    ...(item.filename ? { filename: item.filename } : {}),
  }
}

export async function seedConversationDocuments(establishmentId: string): Promise<void> {
  // Sem storage o anexo não tem onde morar, e um documento linkado sem objeto seria linha morta na
  // tela: melhor a biblioteca nascer vazia do que com item que não abre.
  if (!isStorageEnabled()) {
    console.log('[Seed] Documentos de conversa ignorados: STORAGE_ENABLED desligado.')
    return
  }

  const database = db as unknown as MetaWhatsAppDatabase
  const storage = createConversationObjectStorage()
  const sessionRepository = new SessionRepository(database)
  const documentRepository = new DocumentRepository(database)
  const logMessage = new LogMessageUseCase(sessionRepository, new MessageRepository(database))

  const session = await sessionRepository.getOrCreate(establishmentId, SEED_NUMBER, START_STATE)

  await logMessage.execute({
    companyId: establishmentId,
    whatsappNumber: SEED_NUMBER,
    startState: START_STATE,
    direction: 'inbound',
    sender: 'customer',
    type: 'text',
    content: 'segue tudo que eu tenho aqui',
    waMessageId: `wamid.seed.media.${SEED_NUMBER}.opener`,
  })

  for (const [index, item] of MEDIA_SEED_ITEMS.entries()) {
    const mediaId = mediaSeedId(index)
    const buffer = await readFile(join(SAMPLES_DIRECTORY, item.sample))
    const { uploadId } = await storage.forModule.upload({
      buffer,
      mimeType: item.mimeType,
      key: storageKeyFor(establishmentId, mediaId),
    })

    const message = await logMessage.execute({
      companyId: establishmentId,
      whatsappNumber: SEED_NUMBER,
      startState: START_STATE,
      direction: 'inbound',
      sender: 'customer',
      type: item.kind,
      ...(item.caption ? { content: item.caption } : {}),
      payload: mediaPayload(item, mediaId, uploadId, buffer.length),
      waMessageId: `wamid.seed.media.${SEED_NUMBER}.${index}`,
    })

    await documentRepository.link({
      companyId: establishmentId,
      sessionId: session.id,
      ...(message ? { messageId: message.id } : {}),
      uploadId,
      // Sem nome, o rótulo é o id da mídia — exatamente o que a tela real mostra para foto e áudio.
      filename: item.filename ?? mediaId,
      mimeType: item.mimeType,
      sizeBytes: buffer.length,
      source: 'customer',
    })
  }

  // Fecha com texto: a prévia da inbox mostra o último conteúdo, e mídia não tem texto — terminar
  // num arquivo deixava a linha do contato em branco, com cara de conversa quebrada.
  await logMessage.execute({
    companyId: establishmentId,
    whatsappNumber: SEED_NUMBER,
    startState: START_STATE,
    direction: 'inbound',
    sender: 'customer',
    type: 'text',
    content: `mandei ${MEDIA_SEED_ITEMS.length} arquivos, um de cada tipo`,
    waMessageId: `wamid.seed.media.${SEED_NUMBER}.closer`,
  })
}
