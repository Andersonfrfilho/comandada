export interface SpeechToTextParams {
  audio: Buffer
  mimeType: string
  /** Palavras que o áudio deve conter (nomes do cardápio): ajudam o modelo a escrever "hot roll" e não "rótulo". */
  vocabularyHint?: string
}

export interface SpeechToTextProvider {
  /** Texto falado no áudio, já sem espaços nas pontas; vazio quando não há fala. */
  transcribe(params: SpeechToTextParams): Promise<string>
}
