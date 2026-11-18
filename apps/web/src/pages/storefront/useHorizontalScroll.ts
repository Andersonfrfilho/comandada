import { useCallback, useEffect, useState, type RefObject } from 'react'

const EDGE_TOLERANCE_PX = 4

/**
 * Faixa que rola de lado (categorias do cardápio). No celular o dedo já rola; no computador a barra
 * fica escondida, então a roda do mouse vira rolagem lateral, dá para arrastar com o mouse e as
 * setas aparecem só quando há mais para um dos lados.
 */
export function useHorizontalScroll(ref: RefObject<HTMLElement | null>) {
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return
    setCanScrollLeft(element.scrollLeft > EDGE_TOLERANCE_PX)
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - EDGE_TOLERANCE_PX)
  }, [ref])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    measure()

    // Roda do mouse (vertical) rola a faixa enquanto ela tiver para onde ir; no fim, a página segue.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const max = element.scrollWidth - element.clientWidth
      if (max <= 0) return
      const atStart = element.scrollLeft <= 0 && event.deltaY < 0
      const atEnd = element.scrollLeft >= max - 1 && event.deltaY > 0
      if (atStart || atEnd) return
      event.preventDefault()
      element.scrollLeft += event.deltaY
    }

    // Arrastar com o mouse; toque fica com o navegador.
    let dragStartX = 0
    let dragStartScroll = 0
    let dragging = false
    let moved = false
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      dragging = true
      moved = false
      dragStartX = event.clientX
      dragStartScroll = element.scrollLeft
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      const distance = event.clientX - dragStartX
      if (!moved && Math.abs(distance) < 5) return
      moved = true
      element.scrollLeft = dragStartScroll - distance
    }
    const onPointerUp = () => {
      dragging = false
    }
    // Soltar depois de arrastar não conta como clique na categoria.
    const onClickCapture = (event: MouseEvent) => {
      if (!moved) return
      moved = false
      event.preventDefault()
      event.stopPropagation()
    }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element)
    for (const child of Array.from(element.children)) resizeObserver.observe(child)

    element.addEventListener('scroll', measure, { passive: true })
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    element.addEventListener('click', onClickCapture, true)
    return () => {
      resizeObserver.disconnect()
      element.removeEventListener('scroll', measure)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('click', onClickCapture, true)
    }
  }, [ref, measure])

  const scrollByPage = useCallback(
    (direction: -1 | 1) => {
      const element = ref.current
      if (!element) return
      element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' })
    },
    [ref]
  )

  return { canScrollLeft, canScrollRight, scrollByPage }
}

/**
 * Centraliza o item na faixa sem mexer na rolagem da página (scrollIntoView mexe e trava o dedo no iPhone).
 * A faixa precisa ser `relative` para o offsetLeft do item contar a partir dela.
 */
export function centerInStrip(strip: HTMLElement, item: HTMLElement) {
  const left = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2
  strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
}
