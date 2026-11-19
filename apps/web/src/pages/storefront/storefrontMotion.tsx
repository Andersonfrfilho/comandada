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
  /** Opção que acabou de ser escolhida: afunda e volta com mola. */
  select: 'sf-select',
  /** Ícone de check que aparece girando. */
  check: 'sf-check',
  /** Ícone da opção escolhida dá um pulinho. */
  hop: 'sf-hop',
  /** Destaque que desliza entre as categorias. */
  slide: 'sf-slide',
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
      .sf-select { animation: sfSelect .38s cubic-bezier(.3,1.5,.5,1); }
      .sf-check { animation: sfCheck .34s cubic-bezier(.3,1.6,.5,1) both; }
      .sf-hop { animation: sfHop .45s cubic-bezier(.3,1.5,.5,1); }
      .sf-slide { transition: transform .38s cubic-bezier(.3,1.25,.5,1), width .38s cubic-bezier(.3,1.25,.5,1), opacity .2s; }
      .sf-ping { animation: sfPing .5s ease-out; }
      @keyframes sfSelect { 0% { transform: scale(1) } 35% { transform: scale(.96) } 70% { transform: scale(1.02) } 100% { transform: scale(1) } }
      @keyframes sfCheck { from { transform: scale(0) rotate(-90deg); opacity: 0 } to { transform: none; opacity: 1 } }
      @keyframes sfHop { 0%, 100% { transform: none } 40% { transform: translateY(-4px) scale(1.12) } }
      @keyframes sfPing { from { box-shadow: 0 0 0 0 rgb(var(--brand-500, 224 90 20) / .5) } to { box-shadow: 0 0 0 14px rgb(var(--brand-500, 224 90 20) / 0) } }
      @keyframes sfPop { 0% { transform: scale(1) } 40% { transform: scale(1.35) } 100% { transform: scale(1) } }
      @keyframes sfRise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
      @keyframes sfBump { 0% { transform: scale(1) } 30% { transform: scale(1.06) } 60% { transform: scale(.98) } 100% { transform: scale(1) } }
      @media (prefers-reduced-motion: reduce) {
        .sf-reveal { opacity: 1; transform: none; transition: none; }
        .sf-pop, .sf-rise, .sf-bump, .sf-intro, .sf-select, .sf-check, .sf-hop, .sf-ping { animation: none; }
        .sf-slide { transition: none; }
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

/** Um palito do hashi (madeira com a ponta mais clara), girando a partir da ponta. */
function chopstick(rotation: number, offsetX: number): HTMLElement {
  const stick = document.createElement('div')
  Object.assign(stick.style, {
    position: 'absolute',
    left: `calc(50% + ${offsetX}px)`,
    bottom: '50%',
    width: '5px',
    height: '74px',
    marginLeft: '-2.5px',
    borderRadius: '3px 3px 2px 2px',
    background: 'linear-gradient(180deg, #3b2314 0%, #6b4226 70%, #c89b6d 100%)',
    boxShadow: '0 2px 4px rgba(0,0,0,.25)',
    transformOrigin: '50% 100%',
    transform: `rotate(${rotation}deg)`,
  })
  return stick
}

/**
 * O hashi desce, pega a foto do produto e leva até o carrinho, que dá um pulo. Sem foto vai uma
 * bolinha da cor da marca. O carrinho pode ainda não existir (primeiro item): aí espera um quadro.
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
      zIndex: '60',
      pointerEvents: 'none',
    })
    const morsel = document.createElement('div')
    Object.assign(morsel.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: '9999px',
      boxShadow: '0 6px 18px rgba(0,0,0,.25)',
      border: '2px solid #fff',
      background: imageUrl ? `center / cover no-repeat url("${imageUrl}")` : 'rgb(var(--brand-600, 192 70 7))',
    })
    const sticks = document.createElement('div')
    Object.assign(sticks.style, { position: 'absolute', inset: '0' })
    const upper = chopstick(32, -10)
    const lower = chopstick(14, 12)
    sticks.append(upper, lower)
    flyer.append(morsel, sticks)
    document.body.appendChild(flyer)

    // 1) o hashi desce de cima e à direita e fecha na peça.
    sticks.animate(
      [
        { transform: 'translate(26px, -34px)', opacity: 0 },
        { transform: 'translate(0, 0)', opacity: 1, offset: 0.7 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ],
      { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }
    )
    upper.animate([{ transform: 'rotate(40deg)' }, { transform: 'rotate(26deg)' }], { duration: 160, delay: 220, easing: 'ease-out', fill: 'both' })
    lower.animate([{ transform: 'rotate(6deg)' }, { transform: 'rotate(20deg)' }], { duration: 160, delay: 220, easing: 'ease-out', fill: 'both' })

    // 2) levanta a peça e leva até o carrinho.
    const deltaX = to.left + Math.min(to.width / 2, 40) - (from.left + from.width / 2)
    const deltaY = to.top + to.height / 2 - (from.top + from.height / 2)
    const animation = flyer.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0.36 },
        { transform: 'translate(0, -14px) scale(1.06)', opacity: 1, offset: 0.46 },
        { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.5 - 70}px) scale(.9)`, opacity: 1, offset: 0.72 },
        { transform: `translate(${deltaX}px, ${deltaY}px) scale(.35)`, opacity: 0.3 },
      ],
      { duration: 1000, easing: 'cubic-bezier(.45,0,.25,1)' }
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

/** Onda que sai do botão ao tocar (adicionar). Reinicia se tocar de novo. */
export function ping(element: HTMLElement | null) {
  if (!element || prefersReducedMotion()) return
  element.classList.remove('sf-ping')
  void element.offsetWidth
  element.classList.add('sf-ping')
}
