import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ImageOff, ImagePlus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { confirmDialog } from '@/stores/confirmStore'
import { Button } from '@/components/ui/Button'
import {
  PRODUCT_IMAGE_MAX_UPLOAD_BYTES,
  productImagePath,
  productImageUrl,
  readFileAsDataUrl,
} from '@/lib/productImage'

interface ProductPhotoManagerProps {
  productId: string
  productName: string
  imageVersion: string | null
  onChanged: () => void
}

/**
 * Foto do produto no cadastro: aparece no cardápio online. A API reduz para 800 px em WebP, então dá
 * para mandar a foto do celular direto.
 */
export function ProductPhotoManager({ productId, productName, imageVersion, onChanged }: ProductPhotoManagerProps) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const fileInput = useRef<HTMLInputElement>(null)
  const imageUrl = productImageUrl(productImagePath(productId, imageVersion))

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const image = await readFileAsDataUrl(file)
      return api.put(`/catalog/products/${productId}/image`, { image }, accessToken)
    },
    onSuccess: () => {
      toast.success('Foto salva')
      onChanged()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/catalog/products/${productId}/image`, accessToken),
    onSuccess: () => {
      toast.success('Foto removida')
      onChanged()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Escolha uma imagem (JPG, PNG ou WebP)')
      return
    }
    if (file.size > PRODUCT_IMAGE_MAX_UPLOAD_BYTES) {
      toast.error('Foto muito grande (máximo 12 MB)')
      return
    }
    upload.mutate(file)
  }

  async function confirmRemove() {
    const confirmed = await confirmDialog({
      title: 'Remover a foto?',
      message: `${productName} fica sem foto no cardápio online.`,
      confirmLabel: 'Remover',
      tone: 'danger',
    })
    if (confirmed) remove.mutate()
  }

  return (
    <div className="border-t border-gray-100 pt-4">
      <p className="text-sm font-medium text-gray-700 mb-2">Foto no cardápio</p>
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt={productName} className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-6 w-6 text-gray-300" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={chooseFile} />
          <Button
            variant="secondary"
            size="sm"
            loading={upload.isPending}
            loadingLabel="Enviando..."
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus className="h-3.5 w-3.5 mr-1 inline" aria-hidden="true" />
            {imageUrl ? 'Trocar foto' : 'Adicionar foto'}
          </Button>
          {imageUrl && (
            <Button variant="ghost" size="sm" loading={remove.isPending} onClick={() => void confirmRemove()}>
              Remover foto
            </Button>
          )}
          <p className="text-[11px] text-gray-400">JPG, PNG ou WebP. A foto é reduzida automaticamente.</p>
        </div>
      </div>
    </div>
  )
}
