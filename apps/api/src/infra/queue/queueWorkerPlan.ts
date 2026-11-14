/** Quais consumidores de fila sobem em cada processo. Ver `startQueueWorkers` para o porquê. */

export type QueueWorkerRuntime = 'api' | 'worker'

export type Environment = Record<string, string | undefined>

export interface QueueWorkerPlan {
  whatsAppInbound: boolean
  fiscal: boolean
  finance: boolean
  ifood: boolean
  productAffinity: boolean
  stock: boolean
  documentIngestion: boolean
}

export function planQueueWorkers(
  runtime: QueueWorkerRuntime,
  environment: Environment,
  documentIngestionEnabled: boolean
): QueueWorkerPlan {
  const isOn = (name: string): boolean => environment[name] === 'true'
  const apiWorkersDisabled = runtime === 'api' && environment['API_QUEUE_WORKERS'] === 'false'

  if (apiWorkersDisabled) {
    return {
      whatsAppInbound: false,
      fiscal: false,
      finance: false,
      ifood: false,
      productAffinity: false,
      stock: false,
      documentIngestion: false,
    }
  }

  return {
    whatsAppInbound:
      runtime === 'worker'
        ? environment['WHATSAPP_INBOUND_WORKER_ENABLED'] !== 'false'
        : isOn('WHATSAPP_INBOUND_WORKER_ENABLED'),
    fiscal: isOn('FISCAL_WORKER_ENABLED'),
    finance: isOn('FINANCE_WORKER_ENABLED'),
    ifood: isOn('IFOOD_ENABLED'),
    productAffinity: isOn('PRODUCT_AFFINITY_WORKER_ENABLED'),
    stock: isOn('STOCK_WORKER_ENABLED'),
    documentIngestion: documentIngestionEnabled,
  }
}

