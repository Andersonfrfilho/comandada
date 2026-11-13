/**
 * Converte o `File` do navegador no formato que `ConversationsApi.sendMedia` pede.
 *
 * Base64 e não multipart porque é o mesmo formato que a Graph API consome — traduzir duas vezes
 * só acrescentaria uma cópia do binário no caminho.
 */

const CHUNK_SIZE = 8192
const RECORDED_AUDIO_FALLBACK_NAME = 'audio.ogg'
const DEFAULT_MIME_TYPE = 'application/octet-stream'

export interface MediaAttachment {
  readonly base64: string
  readonly mimeType: string
  readonly filename: string
}

export async function fileToAttachment(file: File): Promise<MediaAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer())

  // Em blocos, não `String.fromCharCode(...bytes)`: espalhar centenas de milhares de bytes como
  // argumentos estoura o limite da engine, e a falha só apareceria nos arquivos grandes.
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))
  }

  return {
    base64: btoa(binary),
    mimeType: file.type || DEFAULT_MIME_TYPE,
    filename: file.name || RECORDED_AUDIO_FALLBACK_NAME,
  }
}
