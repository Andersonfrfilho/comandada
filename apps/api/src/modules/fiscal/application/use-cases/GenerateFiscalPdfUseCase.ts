import { eq, and, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import {
  buildCupomPdf,
  type FiscalItem,
  type FiscalPayment,
  type FiscalResult,
} from '@adatechnology/fiscal-provider'
import { buildFiscalConfigFromDb } from './TestFiscalConnectionUseCase'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { fiscalTotalOf } from '../fiscalTotal'

type Database = NodePgDatabase<typeof schema>

type OrderItemRow = {
  productId: string | null
  productName: string
  unitPrice: string
  quantity: number
  totalPrice: string
}

export class GenerateFiscalPdfUseCase {
  constructor(private readonly database: Database) {}

  async execute(documentId: string, establishmentId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const document = await this.database.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.id, documentId),
        eq(schema.fiscalDocuments.establishmentId, establishmentId),
      ),
    })
    if (!document) throw new NotFoundError('Fiscal document')
    if (!document.xmlAutorizado) {
      throw new UnprocessableError('XML not available for this document')
    }

    const config = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })
    if (!config || config.model === 'none') {
      throw new UnprocessableError('Fiscal configuration not found')
    }

    const fiscalConfig = buildFiscalConfigFromDb({
      model: config.model,
      environment: config.environment,
      cnpj: config.cnpj,
      inscricaoEstadual: config.inscricaoEstadual,
      razaoSocial: config.razaoSocial,
      uf: config.uf,
      municipio: config.municipio,
      cep: config.cep,
      logradouro: config.logradouro,
      numero: config.numero,
      bairro: config.bairro,
      complemento: config.complemento,
      crt: config.crt,
      providerConfig: config.providerConfig as Record<string, unknown>,
    })

    const order = await this.database.query.orders.findFirst({
      where: eq(schema.orders.id, document.orderId),
    })
    if (!order) throw new NotFoundError('Order')

    const orderItems = await this.database.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, document.orderId),
    })

    const fiscalItems = await this.buildFiscalItems(orderItems as OrderItemRow[])

    const fiscalPayments: FiscalPayment[] = [
      { method: 'pix' as const, amount: fiscalTotalOf(order) },
    ]

    const result: FiscalResult = {
      success: true,
      xmlAutorizado: document.xmlAutorizado,
      rawResponse: (document.providerResponse as Record<string, unknown>) ?? {},
      ...(document.chaveAcesso ? { chaveAcesso: document.chaveAcesso } : {}),
      ...(document.protocolo ? { protocolo: document.protocolo } : {}),
      ...(document.numeroDocumento ? { numeroDocumento: document.numeroDocumento } : {}),
      ...(document.serie ? { serie: document.serie } : {}),
      ...(document.qrCodeUrl ? { qrCodeUrl: document.qrCodeUrl } : {}),
    }

    const pdf = await buildCupomPdf({
      emitParams: {
        referenceId: documentId,
        items: fiscalItems,
        payments: fiscalPayments,
        totalAmount: fiscalTotalOf(order),
        discountAmount: Number(document.totalDesconto ?? 0),
        config: fiscalConfig,
      },
      config: fiscalConfig,
      result,
      qrCodePayload: document.qrCodeUrl ?? '',
      ...(document.authorizedAt ? { dataEmissao: document.authorizedAt } : {}),
    })

    return {
      buffer: Buffer.from(pdf.base64, 'base64'),
      fileName: pdf.fileName,
      mimeType: pdf.mimeType,
    }
  }

  private async buildFiscalItems(orderItems: OrderItemRow[]): Promise<FiscalItem[]> {
    const productIds = orderItems
      .map((item) => item.productId)
      .filter((id): id is string => id !== null)

    const productCatalog = new Map<string, string | null>()
    if (productIds.length > 0) {
      const products = await this.database.query.products.findMany({
        where: inArray(schema.products.id, productIds),
        columns: { id: true, catalogId: true },
      })
      for (const product of products) {
        productCatalog.set(product.id, product.catalogId)
      }
    }

    const catalogIds = [...new Set(productCatalog.values())].filter((id): id is string => id !== null)
    const catalogMap = new Map<string, typeof schema.catalogs.$inferSelect>()
    if (catalogIds.length > 0) {
      const catalogs = await this.database.query.catalogs.findMany({
        where: inArray(schema.catalogs.id, catalogIds),
      })
      for (const catalog of catalogs) {
        catalogMap.set(catalog.id, catalog)
      }
    }

    return orderItems.map((item, index) => {
      let ncm = '21069090'
      let cfop = '5102'
      let cst = '400'

      if (item.productId) {
        const catalogId = productCatalog.get(item.productId)
        if (catalogId) {
          const catalog = catalogMap.get(catalogId)
          if (catalog) {
            if (catalog.ncmCode) ncm = catalog.ncmCode
            if (catalog.cfopCode) cfop = catalog.cfopCode
            if (catalog.cstIcms) cst = catalog.cstIcms
          }
        }
      }

      return {
        codigo: String(index + 1).padStart(3, '0'),
        descricao: item.productName,
        ncm,
        cfop,
        cst,
        unidade: 'UN',
        quantidade: item.quantity,
        valorUnitario: Number(item.unitPrice),
        valorTotal: Number(item.totalPrice),
      }
    })
  }
}
