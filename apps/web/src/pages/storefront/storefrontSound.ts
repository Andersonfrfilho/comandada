import { useCallback, useState } from 'react'

// Som do cardápio online: só o "Yo!" curto quando o selo carimba o pedido enviado. O cliente
// desliga no alto-falante do topo; a escolha fica no aparelho.

const SOUND_STORAGE_KEY = 'storefront-sound'
const STAMP_SOUND_URL = '/sounds/yo-curto.mp3'
const STAMP_SOUND_VOLUME = 0.8

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
  if (!readSoundEnabled() || typeof Audio === 'undefined') return
  const audio = new Audio(STAMP_SOUND_URL)
  audio.volume = STAMP_SOUND_VOLUME
  void audio.play().catch(() => undefined)
}
