import { useEffect, type RefObject } from 'react'

// Animações do cardápio online. Tudo é CSS ou Web Animations (transform e opacity, que o celular
// faz na GPU) e some com "reduzir movimento" do sistema.

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Classes das animações; os keyframes ficam em `StorefrontMotionStyles`. */
export const MOTION = {
  /** Item aparece subindo de leve quando entra na tela (`data-reveal`). */
  reveal: 'sf-reveal',
  /** Número que muda dá um pulinho (use `key` com o valor para reiniciar). */
  pop: 'sf-pop',
  /** Entrada de baixo para cima (barra do carrinho, linha nova). */
  rise: 'sf-rise',
  /** Carrinho "recebe" o item. */
  bump: 'sf-bump',
  /** Entrada do topo da página, em sequência (`--sf-delay`). */
  intro: 'sf-intro',
} as const

export function StorefrontMotionStyles() {
  return (
    <style>{`
      .sf-reveal { opacity: 0; transform: translateY(14px); transition: opacity .45s ease-out, transform .45s cubic-bezier(.2,.8,.2,1); transition-delay: var(--sf-delay, 0ms); }
      .sf-reveal[data-revealed] { opacity: 1; transform: none; }
      .sf-pop { animation: sfPop .32s cubic-bezier(.3,1.6,.5,1); }
      .sf-rise { animation: sfRise .34s cubic-bezier(.2,.8,.2,1) both; }
      .sf-bump { animation: sfBump .42s cubic-bezier(.3,1.5,.5,1); }
      .sf-intro { animation: sfRise .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--sf-delay, 0ms); }
      @keyframes sfPop { 0% { transform: scale(1) } 40% { transform: scale(1.35) } 100% { transform: scale(1) } }
      @keyframes sfRise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
      @keyframes sfBump { 0% { transform: scale(1) } 30% { transform: scale(1.06) } 60% { transform: scale(.98) } 100% { transform: scale(1) } }
      @media (prefers-reduced-motion: reduce) {
        .sf-reveal { opacity: 1; transform: none; transition: none; }
        .sf-pop, .sf-rise, .sf-bump, .sf-intro { animation: none; }
      }
    `}</style>
  )
}

/**
 * Mostra cada `[data-reveal]` dentro do container quando ele entra na tela, uma vez só. Itens que já
 * estão na tela ao abrir aparecem em sequência curta (`data-reveal-index`).
 */
export function useRevealOnScroll(containerRef: RefObject<HTMLElement | null>, contentKey: unknown) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const pending = Array.from(container.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])'))
    if (pending.length === 0) return
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      for (const element of pending) element.dataset.revealed = ''
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const element = entry.target as HTMLElement
          const index = Number(element.dataset.revealIndex ?? 0)
          element.style.setProperty('--sf-delay', `${Math.min(index, 5) * 50}ms`)
          element.dataset.revealed = ''
          observer.unobserve(element)
        }
      },
      { rootMargin: '0px 0px -40px 0px' }
    )
    for (const element of pending) observer.observe(element)
    return () => observer.disconnect()
  }, [containerRef, contentKey])
}

const CART_TARGET_SELECTOR = '[data-cart-target]'

/** Alvo do carrinho visível agora (barra de baixo no celular, painel no computador). */
function visibleCartTarget(): HTMLElement | null {
  const targets = Array.from(document.querySelectorAll<HTMLElement>(CART_TARGET_SELECTOR))
  return targets.find((target) => target.getClientRects().length > 0 && target.offsetParent !== null) ?? null
}

/**
 * Bolinha com a foto do produto voa do botão até o carrinho e o carrinho dá um pulo. Sem foto vai
 * uma bolinha da cor da marca. O carrinho pode ainda não existir (primeiro item): aí espera um quadro.
 */
export function flyToCart(source: HTMLElement | null, imageUrl: string | null) {
  if (!source || prefersReducedMotion() || typeof document === 'undefined') return
  const from = source.getBoundingClientRect()
  requestAnimationFrame(() => {
    const target = visibleCartTarget()
    if (!target) return
    const to = target.getBoundingClientRect()
    const size = 44
    const flyer = document.createElement('div')
    flyer.setAttribute('aria-hidden', 'true')
    Object.assign(flyer.style, {
      position: 'fixed',
      left: `${from.left + from.width / 2 - size / 2}px`,
      top: `${from.top + from.height / 2 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '9999px',
      zIndex: '60',
      pointerEvents: 'none',
      boxShadow: '0 6px 18px rgba(0,0,0,.25)',
      border: '2px solid #fff',
      background: imageUrl ? `center / cover no-repeat url("${imageUrl}")` : 'rgb(var(--brand-600, 192 70 7))',
    })
    document.body.appendChild(flyer)
    const deltaX = to.left + Math.min(to.width / 2, 40) - (from.left + from.width / 2)
    const deltaY = to.top + to.height / 2 - (from.top + from.height / 2)
    const animation = flyer.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${deltaX * 0.45}px, ${deltaY * 0.45 - 60}px) scale(.9)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${deltaX}px, ${deltaY}px) scale(.35)`, opacity: 0.4 },
      ],
      { duration: 620, easing: 'cubic-bezier(.45,0,.25,1)' }
    )
    animation.onfinish = () => {
      flyer.remove()
      target.classList.remove(MOTION.bump)
      void target.offsetWidth
      target.classList.add(MOTION.bump)
    }
    animation.oncancel = () => flyer.remove()
  })
}
