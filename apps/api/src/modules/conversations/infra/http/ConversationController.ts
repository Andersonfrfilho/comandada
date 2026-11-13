/**
 * Borda HTTP das conversas sobre o @adatechnology/meta-whatsapp-module.
 *
 * O controller não tem regra de negócio: valida entrada, resolve o tenant a partir do JWT e
 * delega. `companyId` **sempre** vem de `request.user.establishmentId` — nunca do corpo — porque
 * o número de WhatsApp é endereçável e aceitar o tenant do cliente seria BOLA (OWASP API1).
 *
 * As rotas e o vocabulário do Order Hub são preservados; o que mudou por baixo é quem executa.
 */

import { z } from 'zod'
import type { MessageRow } from '@adatechnology/meta-whatsapp-module'
import type { ObjectStorageInterface } from '@adatechnology/meta-whatsapp-contracts'
import type { RouteHandler } from '@/infra/http/router'
import { ValidationError, UnauthorizedError, NotFoundError } from '@/shared/errors/AppError'
import type { MetaWhatsAppModuleRegistry } from '../whatsapp/metaWhatsAppModule'
import {
  CONVERSATION_AGENT_SENDER as AGENT_SENDER,
  CONVERSATION_START_STATE as START_STATE,
} from '../../shared/conversations.constant'


const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DEFAULT_HISTORY_LIMIT = 50
const MAX_HISTORY_LIMIT = 200
const DEFAULT_DOCUMENTS_PER_PAGE = 10
const MAX_DOCUMENTS_PER_PAGE = 50
const DOCUMENTS_UNAVAILABLE_MESSAGE = 'Biblioteca de documentos indisponível'

/**
 * Traduz o apelido de origem que a UI manda para as origens reais gravadas na coluna.
 *
 * "Equipe" agrupa `agent` e `bot` porque, para quem procura um comprovante, o que importa é se o
 * arquivo veio do cliente ou saiu da loja — não se quem enviou foi a pessoa ou o robô.
 */
function resolveSourceFilter(source: string | undefined): { sources?: readonly string[] } {
  if (source === 'team') return { sources: ['agent', 'bot'] }
  if (source === 'customer') return { sources: ['customer'] }
  // 'all', ausente ou desconhecido: sem filtro, em vez de devolver lista vazia.
  return {}
}

const sendMessageSchema = z.object({
  body: z.string().min(1).max(4096),
})

const sendMediaSchema = z.object({
  base64Data: z.string().min(1),
  mimeType: z.string().min(1),
  filename: z.string().min(1).max(255),
  caption: z.string().max(1024).optional(),
})

const sendTemplateSchema = z.object({
  templateName: z.string().min(1).max(255),
  languageCode: z.string().max(20).optional(),
  bodyParameters: z.array(z.string()).optional(),
})

const logMessageSchema = z.object({
  establishmentId: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  sender: z.enum(['customer', 'bot', 'agent']),
  agentUserId: z.string().uuid().optional(),
  type: z.string().min(1).max(32),
  content: z.string().max(4096).optional(),
  payload: z.record(z.unknown()).optional(),
  waMessageId: z.string().max(128).optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed', 'received']).optional(),
})

const requestHumanSchema = z.object({
  establishmentId: z.string().uuid(),
})

function boundedInteger(raw: string | undefined, fallback: number, max: number): number {
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export class ConversationController {
  /**
   * `objectStorage` é ausente quando `STORAGE_ENABLED` é falso: a listagem continua respondendo
   * (é só consulta ao banco) e só o download fica indisponível.
   */
  constructor(
    private readonly modules: MetaWhatsAppModuleRegistry,
    private readonly objectStorage?: ObjectStorageInterface | undefined
  ) {}

  private tenantOf(request: Parameters<RouteHandler>[0]): { companyId: string; userId: string } {
    if (!request.user) throw new UnauthorizedError()
    return { companyId: request.user.establishmentId, userId: request.user.id }
  }

  private numberOf(request: Parameters<RouteHandler>[0]): string {
    const whatsappNumber = request.params['whatsapp']
    if (!whatsappNumber) throw new ValidationError('whatsappNumber is required')
    return whatsappNumber
  }

  list: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const { page, pageSize, waitingHuman, search } = request.query

    const currentPage = boundedInteger(page, 1, Number.MAX_SAFE_INTEGER)
    const limit = boundedInteger(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    // O módulo não expõe contagem total; pedir um item a mais é o que permite saber se existe
    // próxima página. O total devolvido é, por isso, um piso — exato só na última página.
    const rows = await this.modules.forEstablishment(companyId).conversations.list.execute({
      companyId,
      filters: {
        page: currentPage,
        limit: limit + 1,
        ...(waitingHuman === 'true' ? { waitingHuman: true } : {}),
        ...(search ? { search } : {}),
      },
    })

    const hasNextPage = rows.length > limit
    const data = hasNextPage ? rows.slice(0, limit) : rows
    const consumed = (currentPage - 1) * limit + data.length

    response.json({ data, total: hasNextPage ? consumed + 1 : consumed, hasNextPage })
  }

  history: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const { before, limit } = request.query

    const pageLimit = boundedInteger(limit, DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT)
    const rows = await this.modules.forEstablishment(companyId).conversations.listMessages.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
      limit: pageLimit + 1,
      ...(before ? { before } : {}),
    })

    const hasMore = rows.length > pageLimit
    response.json({ data: hasMore ? rows.slice(0, pageLimit) : rows, hasMore })
  }

  context: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const session = await this.modules
      .forEstablishment(companyId)
      .conversations.repository.getContext(companyId, this.numberOf(request))

    if (!session) throw new NotFoundError('Conversation not found')
    response.json({ currentState: session.currentState, context: session.context })
  }

  send: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const parsed = sendMessageSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const message = await this.modules.forEstablishment(companyId).conversations.send.sendText({
      companyId,
      whatsappNumber: this.numberOf(request),
      body: parsed.data.body,
      sender: AGENT_SENDER,
      agentUserId: userId,
      startState: START_STATE,
    })

    response.json(message, 201)
  }

  sendMedia: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const parsed = sendMediaSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const message = await this.modules.forEstablishment(companyId).conversations.send.sendMedia({
      companyId,
      whatsappNumber: this.numberOf(request),
      buffer: Buffer.from(parsed.data.base64Data, 'base64'),
      mimeType: parsed.data.mimeType,
      filename: parsed.data.filename,
      ...(parsed.data.caption ? { caption: parsed.data.caption } : {}),
      sender: AGENT_SENDER,
      agentUserId: userId,
      startState: START_STATE,
    })

    response.json(message, 201)
  }

  sendTemplate: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const parsed = sendTemplateSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const message = await this.modules.forEstablishment(companyId).conversations.send.sendTemplate({
      companyId,
      whatsappNumber: this.numberOf(request),
      templateName: parsed.data.templateName,
      ...(parsed.data.languageCode ? { languageCode: parsed.data.languageCode } : {}),
      ...(parsed.data.bodyParameters ? { bodyParameters: parsed.data.bodyParameters } : {}),
      sender: AGENT_SENDER,
      agentUserId: userId,
      startState: START_STATE,
    })

    response.json(message, 201)
  }

  takeover: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    await this.modules.forEstablishment(companyId).conversations.takeover.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
      agentUserId: userId,
    })
    response.json({ success: true })
  }

  release: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    await this.modules.forEstablishment(companyId).conversations.release.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
    })
    response.json({ success: true })
  }

  markRead: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    await this.modules
      .forEstablishment(companyId)
      .conversations.repository.markRead(companyId, this.numberOf(request))
    response.json({ success: true })
  }

  markAllRead: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const updated = await this.modules
      .forEstablishment(companyId)
      .conversations.repository.markAllRead(companyId, userId)
    response.json({ success: true, updated })
  }

  export: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const result = await this.modules.forEstablishment(companyId).conversations.export.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
    })
    response.json(result.messages satisfies MessageRow[])
  }

  fetchMedia: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const mediaId = request.params['mediaId']
    if (!mediaId) throw new ValidationError('mediaId is required')

    const media = await this.modules.forEstablishment(companyId).channel.fetchMediaAsBase64(mediaId)
    response.json({ base64: media.data, mimeType: media.mimeType })
  }

  /** Anexos de UMA conversa — o painel lateral da inbox. */
  documents: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const { search, source, sortDirection, page, limit } = request.query

    const result = await this.modules.forEstablishment(companyId).conversations.listDocuments.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
      page: boundedInteger(page, 1, Number.MAX_SAFE_INTEGER),
      limit: boundedInteger(limit, DEFAULT_DOCUMENTS_PER_PAGE, MAX_DOCUMENTS_PER_PAGE),
      ...(search ? { search } : {}),
      ...resolveSourceFilter(source),
      // Qualquer coisa diferente de 'asc' é 'desc': o padrão é mais recente primeiro, e valor
      // inválido na query não deve virar erro numa listagem.
      sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
    })

    response.json(result)
  }

  /** Biblioteca da empresa: os mesmos filtros, sem conversa no caminho. */
  companyDocuments: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const { search, source, sortDirection, page, limit } = request.query

    const result = await this.modules
      .forEstablishment(companyId)
      .conversations.listCompanyDocuments.execute({
        companyId,
        page: boundedInteger(page, 1, Number.MAX_SAFE_INTEGER),
        limit: boundedInteger(limit, DEFAULT_DOCUMENTS_PER_PAGE, MAX_DOCUMENTS_PER_PAGE),
        ...(search ? { search } : {}),
        ...resolveSourceFilter(source),
        sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
      })

    response.json(result)
  }

  /**
   * URL assinada e curta: o binário nunca passa pela API, o atendente vai direto ao storage.
   * Sem storage configurado a rota é 404 — a instalação simplesmente não tem biblioteca.
   */
  documentUrl: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const rawUploadId = request.params['uploadId']
    if (!rawUploadId) throw new ValidationError('uploadId is required')
    if (!this.objectStorage) throw new NotFoundError(DOCUMENTS_UNAVAILABLE_MESSAGE)

    // O router entrega o parâmetro cru; a key tem barras e chega percent-encoded para caber num
    // único segmento da rota.
    const uploadId = decodeURIComponent(rawUploadId)

    // O nome sai da tabela, não da key: a key é caminho no bucket e salvaria o arquivo com o id
    // da Meta em vez de "comprovante.pdf". A consulta é por tenant, então uploadId de outra
    // empresa não encontra nada e não ganha URL.
    const document = await this.modules
      .forEstablishment(companyId)
      .conversations.documentRepository.findByUploadId(companyId, uploadId)

    if (!document) throw new NotFoundError('Document not found')

    const url = await this.objectStorage.getDownloadUrl(uploadId, {
      disposition: request.query['disposition'] === 'attachment' ? 'attachment' : 'inline',
      ...(document.filename ? { filename: document.filename } : {}),
    })

    response.json({ url })
  }

  // Internal (n8n) — protegido por internalAuth; aqui o tenant vem do corpo porque não há JWT de
  // usuário, e o token interno é escopado ao próprio deploy.
  logMessage: RouteHandler = async (request, response) => {
    const parsed = logMessageSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const { establishmentId, agentUserId, content, payload, waMessageId, status } = parsed.data
    const logged = await this.modules.forEstablishment(establishmentId).conversations.log.execute({
      companyId: establishmentId,
      whatsappNumber: this.numberOf(request),
      direction: parsed.data.direction,
      sender: parsed.data.sender,
      type: parsed.data.type,
      agentUserId: agentUserId ?? null,
      content: content ?? null,
      payload: payload ?? null,
      waMessageId: waMessageId ?? null,
      status: status ?? null,
      startState: START_STATE,
    })

    response.json(logged, 201)
  }

  requestHuman: RouteHandler = async (request, response) => {
    const parsed = requestHumanSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const { establishmentId } = parsed.data
    await this.modules
      .forEstablishment(establishmentId)
      .conversations.repository.requestHuman(establishmentId, this.numberOf(request))

    response.json({ success: true })
  }
}
