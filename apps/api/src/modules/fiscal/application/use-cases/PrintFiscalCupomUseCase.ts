import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { paymentMethodLabel } from '@/shared/constants/paymentMethods.constant'
import type { FiscalCupomData, PrinterProvider, PrintResult } from '../printing/PrinterProvider.interface'

type Database = NodePgDatabase<typeof schema>

type PrintFiscalCupomParams = {
  readonly orderId: string
  readonly establishmentId: string
}

export class PrintFiscalCupomUseCase {
  constructor(
    private readonly database: Database,
    private readonly printer: PrinterProvider
  ) {}

  async execute(params: PrintFiscalCupomParams): Promise<PrintResult> {
    const document = await this.database.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.orderId, params.orderId),
        eq(schema.fiscalDocuments.establishmentId, params.establishmentId)
      ),
    })
    if (!document) throw new NotFoundError('Fiscal document')
    if (document.status !== 'authorized') {
      throw new UnprocessableError('Only authorized documents can be printed')
    }

    const config = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, params.establishmentId),
    })
    const [items, payments] = await Promise.all([
      this.database.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, params.orderId) }),
      this.database.query.orderPayments.findMany({ where: eq(schema.orderPayments.orderId, params.orderId) }),
    ])

    const cupom: FiscalCupomData = {
      razaoSocial: config?.razaoSocial ?? '',
      cnpj: config?.cnpj ?? '',
      numeroDocumento: document.numeroDocumento,
      serie: document.serie,
      chaveAcesso: document.chaveAcesso,
      qrCodeUrl: document.qrCodeUrl,
      items: items.map((item) => ({
        descricao: item.productName,
        quantidade: item.quantity,
        valorUnitario: Number(item.unitPrice),
        valorTotal: Number(item.totalPrice),
      })),
      total: Number(document.totalLiquido ?? 0),
      pagamentos: payments.map((payment) => ({
        forma: paymentMethodLabel(payment.paymentTypeName),
        valor: Number(payment.amount),
        trocoPara: payment.changeFor !== null ? Number(payment.changeFor) : null,
        rotulo: payment.splitLabel,
      })),
    }

    return this.printer.print(cupom)
  }
}
