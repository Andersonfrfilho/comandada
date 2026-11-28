/**
 * Implementação do contrato `CouponsAdminApi` do @adatechnology/coupons-ui sobre as rotas do
 * `coupon-module` (`/sdk/coupons`). A empresa vem do token, nunca do corpo.
 */

import type { CouponsAdminApi, ExportRequest, ListCampaignsParams, ListRecordsParams } from '@adatechnology/coupons-ui'

import { api } from '@/lib/api'
import { SDK_PATH, accessToken, buildQuery, sdkDelete, sdkGet, sdkGetPage, sdkPatch, sdkPost } from '@/lib/sdkHttp'

const COUPONS = SDK_PATH.COUPONS

// A rota de exportação de códigos se chama `codes`; contatos e usos mantêm o nome do tipo.
const EXPORT_SEGMENT = { coupons: 'codes', leads: 'leads', redemptions: 'redemptions' } as const

type RecordFilters = Omit<ListRecordsParams, 'page' | 'pageSize'>

function campaignsQuery(params: ListCampaignsParams): string {
  return buildQuery({
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    state: params.states?.join(','),
    sort: params.sort,
    order: params.order,
  })
}

function recordsQuery(params: RecordFilters & { page?: number; pageSize?: number }): string {
  return buildQuery({
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    order: params.order,
    status: params.statuses?.join(','),
    unassigned: params.unassigned,
    from: params.from,
    to: params.to,
  })
}

function exportPath({ campaignId, kind, format, filters }: ExportRequest): string {
  const query = recordsQuery(filters).replace(/^\?/, '')
  const separator = query ? '&' : ''
  return `${COUPONS}/campaigns/${campaignId}/${EXPORT_SEGMENT[kind]}/export?${query}${separator}format=${format}`
}

export const couponsSdkApi: CouponsAdminApi = {
  listCampaigns: (params) => sdkGetPage(`${COUPONS}/campaigns${campaignsQuery(params)}`),
  getCampaign: (id) => sdkGet(`${COUPONS}/campaigns/${id}`),
  createCampaign: (input) => sdkPost(`${COUPONS}/campaigns`, input),
  updateCampaign: (id, input) => sdkPatch(`${COUPONS}/campaigns/${id}`, input),
  removeCampaign: (id) => sdkDelete(`${COUPONS}/campaigns/${id}`),
  getReport: (id) => sdkGet(`${COUPONS}/campaigns/${id}/report`),
  listCoupons: (campaignId, params) => sdkGetPage(`${COUPONS}/campaigns/${campaignId}/codes${recordsQuery(params)}`),
  generateCodes: (campaignId, input) => sdkPost(`${COUPONS}/campaigns/${campaignId}/codes`, input),
  setCouponStatus: (campaignId, couponId, status) =>
    sdkPatch(`${COUPONS}/campaigns/${campaignId}/codes/${couponId}`, { status }),
  listLeads: (campaignId, params) => sdkGetPage(`${COUPONS}/campaigns/${campaignId}/leads${recordsQuery(params)}`),
  listRedemptions: (campaignId, params) =>
    sdkGetPage(`${COUPONS}/campaigns/${campaignId}/redemptions${recordsQuery(params)}`),
  exportRecords: (request) => api.getBlob(exportPath(request), accessToken()),
}
