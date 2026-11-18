import { useEffect } from 'react'

// Visual do cardápio online: topo escuro e quente, fundo creme e títulos numa fonte geométrica.
// A cor do restaurante (brand-*) continua nos botões e nas faixas; o resto é neutro para servir
// qualquer marca.

export const STOREFRONT_INK = 'bg-[#1c120d]'
export const STOREFRONT_CREAM = 'bg-[#fbf4ea]'
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
