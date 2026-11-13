export const FISCAL_QUEUE = 'fiscal' as const

export const FISCAL_JOB = {
  EMIT: 'emit',
  DELIVER: 'deliver',
  SWEEP: 'sweep',
} as const

export type FiscalJobName = (typeof FISCAL_JOB)[keyof typeof FISCAL_JOB]

export type FiscalEmitJobData = {
  fiscalDocumentId: string
  establishmentId: string
}

export type FiscalDeliverJobData = {
  fiscalDocumentId: string
}

export type FiscalSweepJobData = Record<string, never>

export type FiscalJobData = FiscalEmitJobData | FiscalDeliverJobData | FiscalSweepJobData

export const STOCK_EXPIRY_ALERTS_QUEUE = 'stock-expiry-alerts' as const

export const STOCK_EXPIRY_JOB = {
  SCAN_EXPIRING: 'scan-expiring',
} as const

export type StockExpiryJobName = (typeof STOCK_EXPIRY_JOB)[keyof typeof STOCK_EXPIRY_JOB]

export const PRODUCT_AFFINITY_QUEUE = 'product-affinity' as const

export const PRODUCT_AFFINITY_JOB = {
  CALCULATE: 'calculate',
} as const

export type ProductAffinityJobName = (typeof PRODUCT_AFFINITY_JOB)[keyof typeof PRODUCT_AFFINITY_JOB]

/** De madrugada: a varredura é do histórico inteiro e não disputa com o horário de pico. */
export const PRODUCT_AFFINITY_SCAN_CRON = '0 4 * * *'

/** Cardápio muda; hábito de compra de um ano atrás não descreve o que se vende hoje. */
export const PRODUCT_AFFINITY_WINDOW_DAYS = 90

/** Abaixo disso é coincidência, não padrão — sugerir viraria ruído no cadastro. */
export const PRODUCT_AFFINITY_MIN_CO_OCCURRENCE = 3

/** 15% dos pedidos do item; menos que isso não sustenta uma sugestão na tela. */
export const PRODUCT_AFFINITY_MIN_CONFIDENCE = 0.15

/** Mais que isso vira lista, não sugestão — ninguém escolhe entre dez upsells. */
export const PRODUCT_AFFINITY_SUGGESTION_LIMIT = 5

export const MEDIA_PROCESSING_QUEUE = 'media-processing' as const

export const MEDIA_PROCESSING_JOB = {
  RESIZE_IMAGE: 'resize-image',
  OPTIMIZE: 'optimize',
} as const

export type MediaProcessingJobName = (typeof MEDIA_PROCESSING_JOB)[keyof typeof MEDIA_PROCESSING_JOB]

export type MediaProcessingJobData = {
  type: MediaProcessingJobName
  key: string
}

export const CONVERSATION_DOCUMENTS_QUEUE = 'conversation-documents' as const

export const CONVERSATION_DOCUMENTS_JOB = {
  INGEST_INBOUND_MEDIA: 'ingest-inbound-media',
} as const

export type ConversationDocumentsJobName =
  (typeof CONVERSATION_DOCUMENTS_JOB)[keyof typeof CONVERSATION_DOCUMENTS_JOB]

/**
 * O que o módulo entrega no `onMediaReceived` e o que a ingestão precisa de volta. Nenhum campo
 * é dado pessoal: são identificadores opacos da Meta e metadados do arquivo.
 */
export type ConversationDocumentsJobData = {
  companyId: string
  messageId: string
  sourceMediaId: string
  mimeType: string
  filename?: string
}

export const FINANCE_DUE_ALERTS_QUEUE = 'finance-due-alerts' as const

export const FINANCE_DUE_JOB = {
  SCAN_DUE_ACCOUNTS: 'scan-due-accounts',
} as const

export type FinanceDueJobName = (typeof FINANCE_DUE_JOB)[keyof typeof FINANCE_DUE_JOB]

export const IFOOD_POLLING_QUEUE = 'ifood-polling' as const

export const IFOOD_POLLING_JOB = {
  POLL: 'poll',
} as const

export type IfoodPollingJobName = (typeof IFOOD_POLLING_JOB)[keyof typeof IFOOD_POLLING_JOB]
