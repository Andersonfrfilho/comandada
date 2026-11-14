/** Header que a Meta manda com o HMAC-SHA256 do corpo cru, assinado com o app secret. */
export const META_SIGNATURE_HEADER = 'x-hub-signature-256'

/** O n8n responde assim que recebe (`responseMode: onReceived`); passar disso é n8n travado. */
export const BOT_FORWARD_TIMEOUT_MS = 15_000

export const WHATSAPP_INBOUND_JOB_ID_PREFIX = 'wa-'
