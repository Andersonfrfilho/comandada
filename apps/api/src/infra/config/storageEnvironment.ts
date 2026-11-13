/**
 * Configuração do storage S3-compatível onde os anexos das conversas ficam guardados.
 *
 * Validada uma vez, no boot, e só quando `STORAGE_ENABLED` for verdadeiro: instalação sem storage
 * continua subindo, apenas sem biblioteca de documentos. Ler `process.env` espalhado pelo adapter
 * deixaria a falta de credencial aparecer no primeiro upload — meses depois, com o arquivo do
 * cliente já perdido.
 */

import { z } from 'zod'

const storageEnvironmentSchema = z.object({
  STORAGE_ENDPOINT: z.string().url(),
  /**
   * Endereço pelo qual o BROWSER alcança o storage, quando difere do interno — em dev a API fala
   * com `http://minio:9000` pela rede do compose e o navegador só enxerga a porta publicada.
   *
   * A assinatura SigV4 cobre o header `Host`, então uma URL assinada contra o endereço interno é
   * rejeitada ao ser aberta pelo endereço público. Por isso a assinatura sai de um provider à
   * parte, apontado para cá.
   */
  STORAGE_PUBLIC_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().min(1).default('us-east-1'),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  STORAGE_MAX_OBJECT_SIZE_BYTES: z.coerce.number().int().positive().default(26_214_400),
  STORAGE_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
})

export type StorageEnvironment = z.infer<typeof storageEnvironmentSchema>

export function isStorageEnabled(): boolean {
  return process.env['STORAGE_ENABLED'] === 'true'
}

export function loadStorageEnvironment(): StorageEnvironment {
  return storageEnvironmentSchema.parse(process.env)
}
