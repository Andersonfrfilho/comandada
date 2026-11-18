import { API_URL } from './apiEndpoints'

/** Caminho que a API devolve para a foto do produto (`/public/products/:id/foto.webp?v=`). */
export function productImagePath(productId: string, imageVersion: string | null | undefined): string | null {
  return imageVersion ? `/public/products/${productId}/foto.webp?v=${imageVersion}` : null
}

/** URL completa da foto: a API pode estar em outro domínio (nuvem) ou atrás do mesmo nginx (loja). */
export function productImageUrl(path: string | null | undefined): string | null {
  return path ? `${API_URL}${path}` : null
}

/** Arquivo escolhido no painel → data URL, como o logo; a API reduz e converte para WebP. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo'))
    reader.readAsDataURL(file)
  })
}

export const PRODUCT_IMAGE_MAX_UPLOAD_BYTES = 12 * 1024 * 1024
