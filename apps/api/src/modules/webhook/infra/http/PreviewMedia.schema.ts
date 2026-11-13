import { z } from 'zod'

/**
 * Bytes em base64 e não multipart: o painel grava a nota de voz em memória (`Blob` do
 * MediaRecorder) e o resto da API já fala JSON. Um único formato de corpo evita um parser só para
 * esta rota.
 */
export const previewMediaUploadSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().min(1),
  filename: z.string().min(1).optional(),
})

export type PreviewMediaUpload = z.infer<typeof previewMediaUploadSchema>
