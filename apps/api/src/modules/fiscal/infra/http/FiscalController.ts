import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { EmitFiscalDocumentUseCase } from '../../application/use-cases/EmitFiscalDocumentUseCase'
import type { CancelFiscalDocumentUseCase } from '../../application/use-cases/CancelFiscalDocumentUseCase'
import type { GetFiscalDocumentUseCase } from '../../application/use-cases/GetFiscalDocumentUseCase'
import type { UpsertFiscalConfigUseCase } from '../../application/use-cases/UpsertFiscalConfigUseCase'
import type { TestFiscalConnectionUseCase } from '../../application/use-cases/TestFiscalConnectionUseCase'
import type { RetryFiscalDocumentUseCase } from '../../application/use-cases/RetryFiscalDocumentUseCase'
import type { PrintFiscalCupomUseCase } from '../../application/use-cases/PrintFiscalCupomUseCase'
import type { GenerateFiscalPdfUseCase } from '../../application/use-cases/GenerateFiscalPdfUseCase'
import { buildFiscalConfigFromDb } from '../../application/use-cases/TestFiscalConnectionUseCase'
import { verifyFiscalPublicToken } from '../../application/FiscalPublicToken'
import { ValidationError, UnauthorizedError, UnprocessableError, NotFoundError } from '@/shared/errors/AppError'

const upsertFiscalConfigSchema = z.object({
  model: z.enum(['sat', 'nfce', 'nfe', 'none']),
  environment: z.enum(['homologacao', 'producao']),
  cnpj: z.string().max(18).optional(),
  inscricaoEstadual: z.string().max(50).optional(),
  razaoSocial: z.string().max(255).optional(),
  uf: z.string().length(2).optional(),
  municipio: z.string().max(100).optional(),
  cep: z.string().max(9).optional(),
  logradouro: z.string().max(255).optional(),
  numero: z.string().max(20).optional(),
  complemento: z.string().max(100).optional(),
  bairro: z.string().max(100).optional(),
  crt: z.enum(['1', '2', '3']).optional(),
  emitTrigger: z.enum(['on_payment', 'on_completed', 'manual']).optional(),
  emailProvider: z.enum(['resend', 'smtp']).optional(),
  providerConfig: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
})

const cancelFiscalDocumentSchema = z.object({
  justificativa: z.string().min(15).max(255),
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const testConnectionSchema = z.object({
  model: z.enum(['sat', 'nfce', 'nfe']),
  environment: z.enum(['homologacao', 'producao']),
  cnpj: z.string().optional(),
  inscricaoEstadual: z.string().optional(),
  razaoSocial: z.string().optional(),
  uf: z.string().length(2).optional(),
  municipio: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  complemento: z.string().optional(),
  crt: z.enum(['1', '2', '3']).optional(),
  providerConfig: z.record(z.unknown()).optional(),
})

export class FiscalController {
  constructor(
    private readonly emitUseCase: EmitFiscalDocumentUseCase,
    private readonly cancelUseCase: CancelFiscalDocumentUseCase,
    private readonly getUseCase: GetFiscalDocumentUseCase,
    private readonly configUseCase: UpsertFiscalConfigUseCase,
    private readonly testConnectionUseCase: TestFiscalConnectionUseCase,
    private readonly retryUseCase: RetryFiscalDocumentUseCase,
    private readonly printUseCase: PrintFiscalCupomUseCase,
    private readonly pdfUseCase: GenerateFiscalPdfUseCase
  ) {}

  printCupom: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const orderId = request.params['orderId'] ?? ''
    const result = await this.printUseCase.execute({ orderId, establishmentId: request.user.establishmentId })
    if (!result.ok) throw new UnprocessableError(result.error ?? 'Falha ao imprimir o cupom')
    response.json({ ok: true })
  }

  // Public (no auth) — the signed token is the authorization. Only authorized notes are exposed,
  // metadata only (the full XML is a separate explicit download, not shipped on every view).
  getPublicByToken: RouteHandler = async (request, response) => {
    const document = await this.resolvePublicDocument(request.params['token'])
    const razaoSocial = await this.getUseCase.findEstablishmentName(document.establishmentId)

    response.json({
      razaoSocial,
      status: document.status,
      model: document.model,
      numeroDocumento: document.numeroDocumento,
      serie: document.serie,
      chaveAcesso: document.chaveAcesso,
      totalLiquido: document.totalLiquido,
      qrCodeUrl: document.qrCodeUrl,
      danfePdfUrl: document.danfePdfUrl,
      hasXml: document.xmlAutorizado !== null,
      authorizedAt: document.authorizedAt,
    })
  }

  // Public XML download — explicit action by the token holder (their own fiscal note).
  getPublicXml: RouteHandler = async (request, response) => {
    const document = await this.resolvePublicDocument(request.params['token'])
    if (!document.xmlAutorizado) throw new NotFoundError('Fiscal document')
    response.json({ xml: document.xmlAutorizado, chaveAcesso: document.chaveAcesso })
  }

  private resolvePublicDocument = async (token: string | undefined) => {
    const documentId = verifyFiscalPublicToken(token ?? '')
    if (!documentId || !UUID_PATTERN.test(documentId)) throw new NotFoundError('Fiscal document')

    const document = await this.getUseCase.findByIdPublic(documentId)
    if (!document || document.status !== 'authorized') throw new NotFoundError('Fiscal document')
    return document
  }

  emit: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const orderId = request.params['orderId']!
    const doc = await this.emitUseCase.execute({
      orderId,
      establishmentId: request.user.establishmentId,
    })
    response.json(doc, 202)
  }

  getByOrder: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const orderId = request.params['orderId']!
    const doc = await this.getUseCase.execute({
      orderId,
      establishmentId: request.user.establishmentId,
    })
    response.json(doc)
  }

  cancel: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = cancelFiscalDocumentSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const documentId = request.params['id']!
    const result = await this.cancelUseCase.execute({
      fiscalDocumentId: documentId,
      establishmentId: request.user.establishmentId,
      justificativa: parsed.data.justificativa,
    })
    response.json(result)
  }

  downloadXml: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const documentId = request.params['id']!
    const doc = await this.getUseCase.findById(documentId, request.user.establishmentId)
    if (!doc.xmlAutorizado) {
      throw new UnprocessableError('XML not available for this document')
    }
    response.json({ xml: doc.xmlAutorizado })
  }

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const docs = await this.getUseCase.listByEstablishment(request.user.establishmentId)
    response.json(docs)
  }

  downloadPdf: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const documentId = request.params['id']!
    const pdf = await this.pdfUseCase.execute(documentId, request.user.establishmentId)
    response.binary(pdf.buffer, pdf.mimeType, pdf.fileName)
  }

  getConfig: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const config = await this.configUseCase.getByEstablishment(request.user.establishmentId)
    response.json(config)
  }

  upsertConfig: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = upsertFiscalConfigSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const data = parsed.data
    const config = await this.configUseCase.execute({
      establishmentId: request.user.establishmentId,
      model: data.model,
      environment: data.environment,
      cnpj: data.cnpj ?? null,
      inscricaoEstadual: data.inscricaoEstadual ?? null,
      razaoSocial: data.razaoSocial ?? null,
      uf: data.uf ?? null,
      municipio: data.municipio ?? null,
      cep: data.cep ?? null,
      logradouro: data.logradouro ?? null,
      numero: data.numero ?? null,
      complemento: data.complemento ?? null,
      bairro: data.bairro ?? null,
      crt: data.crt ?? '1',
      emitTrigger: data.emitTrigger,
      emailProvider: data.emailProvider,
      providerConfig: data.providerConfig ?? {},
      active: data.active ?? false,
    })
    response.json(config)
  }

  testConnection: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = testConnectionSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const fiscalConfig = buildFiscalConfigFromDb({
      model: parsed.data.model,
      environment: parsed.data.environment,
      cnpj: parsed.data.cnpj ?? null,
      inscricaoEstadual: parsed.data.inscricaoEstadual ?? null,
      razaoSocial: parsed.data.razaoSocial ?? null,
      uf: parsed.data.uf ?? null,
      municipio: parsed.data.municipio ?? null,
      cep: parsed.data.cep ?? null,
      logradouro: parsed.data.logradouro ?? null,
      numero: parsed.data.numero ?? null,
      bairro: parsed.data.bairro ?? null,
      complemento: parsed.data.complemento ?? null,
      crt: parsed.data.crt ?? '1',
      providerConfig: parsed.data.providerConfig ?? null,
    })

    const result = await this.testConnectionUseCase.execute(fiscalConfig)
    response.json(result)
  }

  retry: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const documentId = request.params['id']!
    const document = await this.retryUseCase.retrySingle(documentId, request.user.establishmentId)
    response.json(document)
  }

  retryPending: RouteHandler = async (_request, response) => {
    const result = await this.retryUseCase.retryAllPending()
    response.json(result)
  }
}
