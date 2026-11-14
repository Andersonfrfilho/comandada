import { describe, expect, test } from 'bun:test'
import { TranscribeBotAudioUseCase, vocabularyHintOf } from './TranscribeBotAudioUseCase'
import { GroqSpeechToTextProviderImplementation } from '@/shared/providers/GroqSpeechToTextProviderImplementation'
import type { SpeechToTextParams } from '@/shared/providers/SpeechToTextProvider'

const menu = { establishmentId: 'est-1', productNames: ['Combo Tradicional', 'Temaki Hot (Médio)', 'Temaki Hot (Grande)'] }
const voiceNote = { data: Buffer.from('OggS fake').toString('base64'), mimeType: 'audio/ogg; codecs=opus' }

describe('TranscribeBotAudioUseCase', () => {
  test('baixa a nota de voz pelo canal do restaurante e devolve o texto falado', async () => {
    const calls: Array<{ establishmentId: string; mediaId: string }> = []
    const received: SpeechToTextParams[] = []
    const useCase = new TranscribeBotAudioUseCase({
      menuFor: async () => menu,
      fetchMedia: async (establishmentId, mediaId) => {
        calls.push({ establishmentId, mediaId })
        return voiceNote
      },
      speechToText: {
        transcribe: async (params) => {
          received.push(params)
          return 'dois combo tradicional e um temaki hot grande'
        },
      },
    })
    const result = await useCase.execute({ mediaId: 'wamid-audio', instance: '5516999990000' })
    expect(result).toEqual({ text: 'dois combo tradicional e um temaki hot grande' })
    expect(calls).toEqual([{ establishmentId: 'est-1', mediaId: 'wamid-audio' }])
    expect(received[0]?.mimeType).toBe('audio/ogg; codecs=opus')
    expect(received[0]?.vocabularyHint).toBe('Pedido de comida. Cardápio: Combo Tradicional, Temaki Hot.')
  })

  test('sem chave de transcrição responde indisponível (o bot pede para escrever)', async () => {
    const useCase = new TranscribeBotAudioUseCase({
      menuFor: async () => menu,
      fetchMedia: async () => voiceNote,
      speechToText: null,
    })
    await expect(useCase.execute({ mediaId: 'x' })).rejects.toMatchObject({ statusCode: 503 })
  })

  test('áudio vazio não vai para a transcrição', async () => {
    const useCase = new TranscribeBotAudioUseCase({
      menuFor: async () => menu,
      fetchMedia: async () => ({ data: '', mimeType: 'audio/ogg' }),
      speechToText: { transcribe: async () => 'nunca' },
    })
    await expect(useCase.execute({ mediaId: 'x' })).rejects.toMatchObject({ statusCode: 422 })
  })

  test('dica de vocabulário vazia sem cardápio', () => {
    expect(vocabularyHintOf([])).toBe('')
  })
})

describe('GroqSpeechToTextProviderImplementation', () => {
  test('manda o áudio em português com o cardápio de dica e lê o texto', async () => {
    let sentBody: FormData | null = null
    let sentHeaders: RequestInit['headers']
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = init?.body as FormData
      sentHeaders = init?.headers
      return new Response(JSON.stringify({ text: ' 2 hot roll ' }), { status: 200 })
    }) as typeof fetch
    const provider = new GroqSpeechToTextProviderImplementation('gsk_test', 'whisper-large-v3-turbo', fakeFetch)
    const text = await provider.transcribe({ audio: Buffer.from('OggS'), mimeType: 'audio/ogg; codecs=opus', vocabularyHint: 'Cardápio: Hot Roll' })
    expect(text).toBe('2 hot roll')
    expect(sentHeaders).toEqual({ Authorization: 'Bearer gsk_test' })
    const form = sentBody as unknown as FormData
    expect(form.get('language')).toBe('pt')
    expect(form.get('model')).toBe('whisper-large-v3-turbo')
    expect(form.get('prompt')).toBe('Cardápio: Hot Roll')
    expect((form.get('file') as File).name).toBe('audio.ogg')
  })

  test('erro da Groq vira exceção com o status', async () => {
    const fakeFetch = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch
    const provider = new GroqSpeechToTextProviderImplementation('gsk_test', 'whisper-large-v3-turbo', fakeFetch)
    await expect(provider.transcribe({ audio: Buffer.from('OggS'), mimeType: 'audio/ogg' })).rejects.toThrow('429')
  })
})
