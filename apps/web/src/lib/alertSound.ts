/**
 * Sons do painel. O navegador só libera áudio depois de um toque na página, então o contexto é
 * criado no primeiro clique e reaproveitado. Pedido novo toca o "Yooo!" (arquivo); o resto, um bipe
 * feito na hora (Web Audio).
 */
let audioContext: AudioContext | null = null

export function unlockAlertSound(): void {
  if (audioContext) return
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return
  audioContext = new AudioContextClass()
  void loadNewOrderSound(audioContext)
}

export function playAlertSound(): void {
  if (!audioContext) return
  if (audioContext.state === 'suspended') void audioContext.resume()
  const startAt = audioContext.currentTime
  // Dois tons subindo: dá para ouvir com o barulho da cozinha sem assustar.
  ;[880, 1320].forEach((frequency, index) => {
    if (!audioContext) return
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    const toneStart = startAt + index * 0.18
    gain.gain.setValueAtTime(0.0001, toneStart)
    gain.gain.exponentialRampToValueAtTime(0.4, toneStart + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.16)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(toneStart)
    oscillator.stop(toneStart + 0.17)
  })
}

const NEW_ORDER_SOUND_URL = '/sounds/yo-longo.mp3'
let newOrderBuffer: Promise<AudioBuffer | null> | null = null

function loadNewOrderSound(context: AudioContext): Promise<AudioBuffer | null> {
  newOrderBuffer ??= fetch(NEW_ORDER_SOUND_URL)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
    .then((bytes) => context.decodeAudioData(bytes))
    .catch(() => {
      newOrderBuffer = null
      return null
    })
  return newOrderBuffer
}

/** Pedido novo: "Yooo!" com a batida do tsuzumi. Sem o arquivo, cai no bipe. */
export function playNewOrderSound(): void {
  const context = audioContext
  if (!context) return
  if (context.state === 'suspended') void context.resume()
  void loadNewOrderSound(context).then((buffer) => {
    if (!buffer) {
      playAlertSound()
      return
    }
    const source = context.createBufferSource()
    const gain = context.createGain()
    gain.gain.value = 0.9
    source.buffer = buffer
    source.connect(gain).connect(context.destination)
    source.start()
  })
}
