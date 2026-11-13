/**
 * Implementação do contrato `ConversationsApi` do @adatechnology/conversations-ui sobre as rotas
 * do Order Hub. O SDK é headless: não conhece nossas rotas nem nosso envelope — este adapter é o
 * único lugar que sabe traduzir os dois vocabulários.
 *
 * O identificador de conversa é o número de WhatsApp, igual ao backend.
 */

import type {
  CompanyDocumentPage,
  ConversationDocumentPage,
  ConversationsApi,
  ConversationPage,
  ConversationSummary,
  MessagePayload,
} from '@adatechnology/conversations-ui'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

/** Template aprovado usado para reabrir a janela de 24h quando ela expira. */
export const REOPEN_TEMPLATE_NAME = 'atendimento_reabertura'
const DEFAULT_LANGUAGE_CODE = 'pt_BR'

function accessToken(): string | undefined {
  return useAuthStore.getState().accessToken ?? undefined
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

interface ApiConversationMessage {
  id: string
  whatsappNumber: string
  direction: 'inbound' | 'outbound'
  sender: 'customer' | 'bot' | 'agent'
  type: string
  content: string | null
  payload: Record<string, unknown> | null
  waMessageId: string | null
  status: string | null
  readAt: string | null
  createdAt: string
}

/**
 * O backend devolve o `ConversationSummary` do @adatechnology/meta-whatsapp-contracts, que é
 * estruturalmente o mesmo que o SDK de UI consome — não há tradução de campos a fazer.
 */
interface ListConversationsResponse {
  data: ConversationSummary[]
  total: number
}

interface ListMessagesResponse {
  data: ApiConversationMessage[]
  hasMore: boolean
}

interface ContextResponse {
  currentState: string
  context: Record<string, unknown>
}

interface FetchMediaResponse {
  base64: string
  mimeType: string
}

const RENDERABLE_MESSAGE_TYPES = new Set<MessagePayload['type']>([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'template',
  'interactive',
])

const DELIVERY_STATUSES = new Set<NonNullable<MessagePayload['status']>>(['sent', 'delivered', 'read', 'failed'])

function stringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * A API fala `createdAt`/`received` e tipos livres (`interactive_list`, `button`); o SDK espera
 * `timestamp` e uma união fechada. Sem traduzir aqui o horário vira "NaN:NaN" na bolha e o tipo
 * cai fora do contrato.
 */
export function toMessagePayload(message: ApiConversationMessage): MessagePayload {
  const type = message.type as MessagePayload['type']
  const status = message.status as NonNullable<MessagePayload['status']>
  const payload = message.payload ?? {}

  return {
    id: message.id,
    type: RENDERABLE_MESSAGE_TYPES.has(type) ? type : 'text',
    content: message.content ?? undefined,
    direction: message.direction,
    sender: message.sender,
    timestamp: message.createdAt,
    // `received` é estado de entrada e não tem tique de entrega — virar `undefined` impede a
    // bolha de inbound desenhar confirmação que não existe.
    status: DELIVERY_STATUSES.has(status) ? status : undefined,
    readAt: message.readAt ?? undefined,
    caption: stringField(payload, 'caption'),
    mediaUrl: stringField(payload, 'mediaUrl'),
    // O `waMessageId` é o fallback histórico: mensagens antigas gravavam a mídia sem `mediaId`.
    mediaId: stringField(payload, 'mediaId') ?? message.waMessageId ?? undefined,
    mimeType: stringField(payload, 'mimeType'),
    filename: stringField(payload, 'filename'),
  }
}

/**
 * O `id` que vem do backend é o UUID da sessão; todas as rotas endereçam a conversa pelo número.
 * Sem esta troca o clique pediria mensagens de um id que a API não resolve.
 */
function withNumberAsId(conversation: ConversationSummary): ConversationSummary {
  return { ...conversation, id: conversation.whatsappNumber }
}

/**
 * Ações de atendimento também expostas soltas: no contrato do SDK elas são opcionais por
 * capacidade, e chamá-las pelo objeto obrigaria a tela a afirmar com `!` que existem.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  await api.post(`/conversations/${encodeURIComponent(conversationId)}/read`, {}, accessToken())
}

export async function takeoverConversation(conversationId: string): Promise<void> {
  await api.post(`/conversations/${encodeURIComponent(conversationId)}/takeover`, {}, accessToken())
}

export async function releaseConversation(conversationId: string): Promise<void> {
  await api.post(`/conversations/${encodeURIComponent(conversationId)}/release`, {}, accessToken())
}

export async function finalizeConversation(conversationId: string): Promise<void> {
  await api.post(`/conversations/${encodeURIComponent(conversationId)}/finalize`, {}, accessToken())
}

export const conversationsSdkApi: ConversationsApi = {
  fetchConversations: async (params): Promise<ConversationPage> => {
    const response = await api.get<ListConversationsResponse>(
      `/conversations${buildQuery({
        page: params?.page,
        pageSize: params?.limit,
        waitingHuman: params?.waitingHuman,
        search: params?.search,
      })}`,
      accessToken()
    )

    return { conversations: response.data.map(withNumberAsId), total: response.total }
  },

  // A API devolve o histórico do mais novo para o mais antigo; a timeline desenha do mais antigo
  // para baixo. Inverter aqui evita que cada tela lembre de fazê-lo.
  fetchMessages: async (conversationId, params) => {
    const response = await api.get<ListMessagesResponse>(
      `/conversations/${encodeURIComponent(conversationId)}/messages${buildQuery({
        limit: params?.limit,
        before: params?.before,
      })}`,
      accessToken()
    )

    return [...response.data].reverse().map(toMessagePayload)
  },

  sendMessage: async (conversationId, text) => {
    const message = await api.post<ApiConversationMessage>(
      `/conversations/${encodeURIComponent(conversationId)}/send`,
      { body: text },
      accessToken()
    )
    return toMessagePayload(message)
  },

  sendMedia: async (conversationId, data) => {
    const message = await api.post<ApiConversationMessage>(
      `/conversations/${encodeURIComponent(conversationId)}/send-media`,
      {
        base64Data: data.base64,
        mimeType: data.mimeType,
        filename: data.filename,
        caption: data.caption,
      },
      accessToken()
    )
    return toMessagePayload(message)
  },

  // O SDK deixa `templateName` opcional porque reabrir a janela é a operação; a escolha de qual
  // template a cumpre é do produto.
  sendTemplate: async (conversationId, data) => {
    await api.post(
      `/conversations/${encodeURIComponent(conversationId)}/send-template`,
      {
        templateName: data.templateName ?? REOPEN_TEMPLATE_NAME,
        languageCode: data.languageCode ?? DEFAULT_LANGUAGE_CODE,
        bodyParameters: data.bodyParams,
      },
      accessToken()
    )
  },

  markRead: markConversationRead,

  markAllRead: async () => {
    await api.post('/conversations/read-all', {}, accessToken())
  },

  // O painel de contexto do SDK consome um dicionário plano; o estado do fluxo entra como mais
  // uma chave para aparecer ao lado dos dados coletados.
  getContext: async (conversationId) => {
    const response = await api.get<ContextResponse>(
      `/conversations/${encodeURIComponent(conversationId)}/context`,
      accessToken()
    )
    return { currentState: response.currentState, ...response.context }
  },

  // Não há storage próprio: a mídia é buscada da Meta sob demanda pelo backend e chega em base64
  // no momento em que o atendente abre o anexo.
  getMediaProxyUrl: async (mediaId) => {
    const result = await api.get<FetchMediaResponse>(
      `/conversations/media/${encodeURIComponent(mediaId)}`,
      accessToken()
    )
    return { mimeType: result.mimeType, data: result.base64 }
  },

  // Repassa filtro, ordenação e página: o backend honra os quatro, e mandar só `search` faria a
  // UI exibir controles que não mudam nada.
  getDocuments: async (conversationId, params) =>
    api.get<ConversationDocumentPage>(
      `/conversations/${encodeURIComponent(conversationId)}/documents${buildQuery({
        search: params?.search,
        source: params?.source,
        sortDirection: params?.sortDirection,
        page: params?.page,
        limit: params?.limit,
      })}`,
      accessToken()
    ),

  // Biblioteca da empresa: mesma forma de filtro, sem conversa no caminho — cada item volta
  // dizendo de qual conversa veio.
  getAllDocuments: async (params) =>
    api.get<CompanyDocumentPage>(
      `/conversations/documents${buildQuery({
        search: params?.search,
        source: params?.source,
        sortDirection: params?.sortDirection,
        page: params?.page,
        limit: params?.limit,
      })}`,
      accessToken()
    ),

  // A rota devolve URL assinada e curta; o binário nunca passa pela API — o atendente vai direto
  // ao storage. Por isso o `uploadId` (que é a key do objeto, com barras) precisa ser escapado.
  getDocumentUrl: async (uploadId, disposition) => {
    const result = await api.get<{ url: string }>(
      `/conversations/documents/${encodeURIComponent(uploadId)}/url${buildQuery({ disposition })}`,
      accessToken()
    )
    return result.url
  },

  takeover: takeoverConversation,
  release: releaseConversation,
  finalize: finalizeConversation,
}

/**
 * Histórico completo da conversa, para o download do transcript. Fora do `ConversationsApi`
 * porque a rota devolve mensagens cruas e não o `{ transcript, filename }` do contrato — quem
 * monta o texto é o `buildTranscriptText` do SDK, na tela.
 */
export async function fetchConversationTranscriptMessages(conversationId: string): Promise<MessagePayload[]> {
  const messages = await api.get<ApiConversationMessage[]>(
    `/conversations/${encodeURIComponent(conversationId)}/export`,
    accessToken()
  )
  return messages.map(toMessagePayload)
}
