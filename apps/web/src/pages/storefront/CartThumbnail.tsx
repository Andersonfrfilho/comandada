import { useMemo } from 'react'
import { productImageUrl } from '@/lib/productImage'
import type { StorefrontMenu } from './storefrontApi'

/** Foto de cada produto do cardápio (todos os tamanhos do item usam a mesma). */
export function useProductImages(menu: StorefrontMenu): Map<string, string> {
  return useMemo(() => {
    const images = new Map<string, string>()
    for (const category of menu.categories) {
      for (const item of category.items) {
        const url = productImageUrl(item.image)
        if (url) for (const option of item.options) images.set(option.productId, url)
      }
    }
    return images
  }, [menu])
}

/** Miniatura do item no carrinho; sem foto, a inicial do nome na cor da marca. */
export function CartThumbnail({ imageUrl, name }: { imageUrl: string | undefined; name: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-xl bg-stone-100 object-cover" />
  }
  return (
    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-base font-bold text-brand-700 ring-1 ring-brand-100">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
