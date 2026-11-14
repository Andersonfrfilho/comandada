/** Nome da variável e da chave que o bot recebe em `config` no contexto. */
export const AUDIO_ORDERS_ENV = 'FEATURE_AUDIO_ORDERS'
export const AUDIO_ORDERS_CONFIG_KEY = 'feature_audio_orders'

/**
 * Pedido por áudio fica desligado até ser validado: só liga com FEATURE_AUDIO_ORDERS=true na API.
 * Desligado, a rota de transcrição responde 503 (sem chamar a Groq) e o bot não fala em áudio.
 */
export function isAudioOrdersEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[AUDIO_ORDERS_ENV]?.trim().toLowerCase() === 'true'
}
