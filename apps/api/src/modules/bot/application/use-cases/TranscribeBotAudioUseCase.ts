import { ServiceUnavailableError, UnprocessableError } from '@/shared/errors/AppError'
import type { SpeechToTextProvider } from '@/shared/providers/SpeechToTextProvider'

export interface TranscribeBotAudioParams {
  mediaId: string
  /** Número da loja que recebeu a mensagem (o mesmo `instance` do contexto). */
  instance?: string | undefined
}

export interface BotAudioMenu {
  establishmentId: string
  productNames: string[]
}

export interface TranscribeBotAudioDependencies {
  /** Restaurante dono do número e os nomes do cardápio (do contexto em cache do bot). */
  menuFor(instance: string | undefined): Promise<BotAudioMenu>
  /** Baixa a mídia pelo id da Meta (ou do simulador), pelo canal do restaurante. */
  fetchMedia(establishmentId: string, mediaId: string): Promise<{ data: string; mimeType: string }>
  /** null quando a transcrição não está configurada (sem GROQ_API_KEY na API). */
  speechToText: SpeechToTextProvider | null
}

// Nota de voz do WhatsApp tem uns 2 KB por segundo: 8 MB passa de meia hora de fala.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

/**
 * Pedido por áudio: o n8n manda o id da nota de voz e recebe o texto falado, que o bot trata igual
 * a uma mensagem digitada. Os nomes do cardápio vão de dica para o modelo acertar "hot roll", "temaki".
 */
export class TranscribeBotAudioUseCase {
  constructor(private readonly dependencies: TranscribeBotAudioDependencies) {}

  async execute(params: TranscribeBotAudioParams): Promise<{ text: string }> {
    const speechToText = this.dependencies.speechToText
    if (!speechToText) throw new ServiceUnavailableError('Audio transcription')

    const menu = await this.dependencies.menuFor(params.instance)
    const media = await this.dependencies.fetchMedia(menu.establishmentId, params.mediaId)
    const audio = Buffer.from(media.data, 'base64')
    if (audio.length === 0) throw new UnprocessableError('Áudio vazio')
    if (audio.length > MAX_AUDIO_BYTES) throw new UnprocessableError('Áudio longo demais para transcrever')

    const text = await speechToText.transcribe({
      audio,
      mimeType: media.mimeType || 'audio/ogg',
      vocabularyHint: vocabularyHintOf(menu.productNames),
    })
    return { text }
  }
}

/** "Cardápio: Combo Tradicional, Hot Roll Salmão, ..." sem repetir o nome-base dos tamanhos. */
export function vocabularyHintOf(productNames: string[]): string {
  const names = [...new Set(productNames.map((name) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean))]
  return names.length > 0 ? `Pedido de comida. Cardápio: ${names.join(', ')}.` : ''
}
