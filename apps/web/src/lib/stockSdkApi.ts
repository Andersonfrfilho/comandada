/**
 * Implementação do contrato `StockApi` do @adatechnology/stock-ui sobre as rotas do `stock-module`
 * (`/sdk/stock`).
 */

import type { StockApi } from '@adatechnology/stock-ui'

import { SDK_PATH, buildQuery, sdkGet, sdkPost, sdkPut } from '@/lib/sdkHttp'

const STOCK = SDK_PATH.STOCK

export const stockSdkApi: StockApi = {
  listLevels: (params) => sdkGet(`${STOCK}/levels${buildQuery({ ...params })}`),
  getLevel: (ingredientId) => sdkGet(`${STOCK}/levels/${ingredientId}`),
  setMinimum: (ingredientId, minimumQuantity) =>
    sdkPut(`${STOCK}/levels/${ingredientId}/minimum`, { minimumQuantity }),
  receiveBatch: (input) => sdkPost(`${STOCK}/batches`, input),
  adjustStock: (input) => sdkPost(`${STOCK}/adjustments`, input),
  recordLoss: (input) => sdkPost(`${STOCK}/losses`, input),
  listBatches: (params) => sdkGet(`${STOCK}/batches${buildQuery({ ...params })}`),
  listMovements: ({ kinds, ...params }) =>
    sdkGet(`${STOCK}/movements${buildQuery({ ...params, kind: kinds?.join(',') })}`),
  listInventories: (params) => sdkGet(`${STOCK}/inventories${buildQuery({ ...params })}`),
  openInventory: (input) => sdkPost(`${STOCK}/inventories`, input),
  getInventory: (id) => sdkGet(`${STOCK}/inventories/${id}`),
  recordCounts: (id, counts) => sdkPut(`${STOCK}/inventories/${id}/counts`, { counts }),
  applyInventory: (id) => sdkPost(`${STOCK}/inventories/${id}/apply`, {}),
  cancelInventory: async (id) => {
    await sdkPost(`${STOCK}/inventories/${id}/cancel`, {})
  },
}

/** Lotes com saldo que vencem dentro do prazo: só o total interessa, então a página é de uma linha. */
export async function countExpiringBatches(withinDays: number): Promise<number> {
  const page = await sdkGet<{ pagination: { total: number } }>(
    `${STOCK}/batches${buildQuery({ page: 1, pageSize: 1, expiringWithinDays: withinDays })}`
  )
  return page.pagination.total
}
