export const PREVIEW_INBOUND_KIND = {
  TEXT: 'text',
  BUTTON_REPLY: 'button_reply',
  LIST_REPLY: 'list_reply',
  AUDIO: 'audio',
  MEDIA: 'media',
} as const

export type PreviewInboundKind = (typeof PREVIEW_INBOUND_KIND)[keyof typeof PREVIEW_INBOUND_KIND]

export const PREVIEW_INBOUND_MEDIA_TYPE = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
} as const

export const PREVIEW_DISABLED_MESSAGE = 'Simulador de conversa desabilitado neste ambiente'
