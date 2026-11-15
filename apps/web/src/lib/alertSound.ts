/**
 * Bipe curto feito na hora (Web Audio), sem arquivo de som. O navegador só libera áudio depois de um
 * toque na página, então o contexto é criado no primeiro clique e reaproveitado.
 */
let audioContext: AudioContext | null = null

export function unlockAlertSound(): void {
  if (audioContext) return
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return
  audioContext = new AudioContextClass()
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
