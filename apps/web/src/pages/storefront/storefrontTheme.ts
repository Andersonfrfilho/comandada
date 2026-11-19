import { useEffect } from 'react'

// Visual do cardápio online: topo em degradê da cor do restaurante até um dourado (pôr do sol),
// fundo pêssego claro e títulos numa fonte geométrica. Tudo parte da cor da marca (brand-*), então
// serve para qualquer restaurante; o dourado só esquenta o fim do degradê.

/** Topo da página. */
export const STOREFRONT_HERO =
  'bg-[linear-gradient(160deg,rgb(var(--brand-700))_0%,rgb(var(--brand-600))_35%,color-mix(in_srgb,rgb(var(--brand-500))_45%,#f59e0b)_75%,color-mix(in_srgb,rgb(var(--brand-400))_35%,#fbbf24)_100%)]'
/** Botões, categoria ativa e barra do carrinho. */
export const STOREFRONT_ACCENT = 'bg-[linear-gradient(135deg,rgb(var(--brand-600))_0%,rgb(var(--brand-500))_55%,color-mix(in_srgb,rgb(var(--brand-500))_25%,#f59e0b)_100%)]'
export const STOREFRONT_CREAM = 'bg-[#fff4e8]'
export const DISPLAY_FONT = "font-['Jost',ui-sans-serif,system-ui,sans-serif]"
export const CARD = 'rounded-2xl bg-white shadow-sm ring-1 ring-[#f0e2cf]'

const FONT_LINK_ID = 'storefront-display-font'
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Jost:wght@500;600;700&display=swap'

/** A fonte dos títulos só é baixada no cardápio, para o painel não pagar por ela. */
export function useDisplayFont(): void {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = FONT_URL
    document.head.appendChild(link)
  }, [])
}
