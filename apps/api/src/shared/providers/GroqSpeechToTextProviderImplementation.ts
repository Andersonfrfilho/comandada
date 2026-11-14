import type { SpeechToTextParams, SpeechToTextProvider } from './SpeechToTextProvider'

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo'
const TRANSCRIPTION_LANGUAGE = 'pt'
const TRANSCRIPTION_TIMEOUT_MS = 30_000
// O prompt do Whisper aceita 224 tokens; o cardápio passa disso fácil e o resto seria cortado lá.
const VOCABULARY_HINT_MAX_CHARS = 600

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
}

interface GroqTranscription {
  text?: unknown
}

/** Nota de voz do WhatsApp (ogg/opus) para texto, pelo Whisper hospedado na Groq. */
export class GroqSpeechToTextProviderImplementation implements SpeechToTextProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_TRANSCRIPTION_MODEL,
    private readonly fetchImplementation: typeof fetch = fetch
  ) {}

  async transcribe(params: SpeechToTextParams): Promise<string> {
    const baseMime = params.mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
    const extension = EXTENSION_BY_MIME[baseMime] ?? 'ogg'
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(params.audio)], { type: baseMime || 'audio/ogg' }), `audio.${extension}`)
    form.append('model', this.model)
    form.append('language', TRANSCRIPTION_LANGUAGE)
    form.append('response_format', 'json')
    form.append('temperature', '0')
    const hint = params.vocabularyHint?.trim()
    if (hint) form.append('prompt', hint.slice(0, VOCABULARY_HINT_MAX_CHARS))

    const response = await this.fetchImplementation(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Transcrição recusada (${response.status}) ${detail.slice(0, 200)}`)
    }
    const body = (await response.json()) as GroqTranscription
    return typeof body.text === 'string' ? body.text.trim() : ''
  }
}
