import { useCallback, useState } from 'react'

// Som do cardápio online: o "Yo!" curto quando o selo carimba o pedido enviado e o "Yooo!" longo
// quando o pedido anda (em preparo, saiu, pronto, entregue). O cliente desliga no alto-falante do
// topo; a escolha fica no aparelho.

const SOUND_STORAGE_KEY = 'storefront-sound'
const STAMP_SOUND_URL = '/sounds/yo-curto.mp3'
const STAMP_SOUND_VOLUME = 0.8
const STATUS_SOUND_URL = '/sounds/yo-longo.mp3'
const STATUS_SOUND_VOLUME = 0.7

function readSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function isStorefrontSoundEnabled(): boolean {
  return readSoundEnabled()
}

export function useStorefrontSound(): { enabled: boolean; toggle: () => void } {
  const [enabled, setEnabled] = useState(readSoundEnabled)
  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, next ? 'on' : 'off')
      } catch {
        // Sem armazenamento (aba anônima): vale só nesta visita.
      }
      return next
    })
  }, [])
  return { enabled, toggle }
}

/**
 * "Yo!" do selo. O navegador só toca depois de um toque na página; o cliente acabou de tocar em
 * "Fazer pedido", então costuma tocar. Se o navegador recusar, fica em silêncio.
 */
export function playStampSound(): void {
  play(STAMP_SOUND_URL, STAMP_SOUND_VOLUME)
}

/**
 * "Yooo!" quando o pedido avança com a página de acompanhamento aberta. Página aberta direto pelo
 * link, sem nenhum toque, o navegador pode segurar: aí fica só a animação.
 */
export function playStatusSound(): void {
  play(STATUS_SOUND_URL, STATUS_SOUND_VOLUME)
}

function play(url: string, volume: number): void {
  if (!readSoundEnabled() || typeof Audio === 'undefined') return
  const audio = new Audio(url)
  audio.volume = volume
  void audio.play().catch(() => undefined)
}
