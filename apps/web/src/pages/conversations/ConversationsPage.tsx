/**
 * Inbox de atendimento. A tela inteira vem do `ConversationsWorkspace` do
 * @adatechnology/conversations-ui: grade, filtros, paginação, seleção em massa e conversa são a
 * mesma coisa nos três produtos, e enquanto cada um montava a própria cópia elas divergiam sem que
 * nenhuma revisão percebesse.
 *
 * O que é do restaurante entra pelos slots: o vocabulário do contexto do fluxo do bot, as respostas
 * prontas, a exportação completa do transcript e o simulador de cliente.
 */

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import '@adatechnology/conversations-ui/styles.css'
import { ConversationsProvider, ConversationsWorkspace } from '@adatechnology/conversations-ui'
import {
  ConversationSimulatorPanel,
  createPreviewBridgeClient,
} from '@adatechnology/conversations-ui/preview'

import { CONVERSATION_QUERY_PARAM } from '@/constants/conversationLinks'
import { api } from '@/lib/api'
import { conversationsSdkApi } from '@/lib/conversationsSdkApi'
import { conversationsSdkRealtime } from '@/lib/conversationsSdkRealtime'
import { fileToAttachment } from '@/lib/fileToAttachment'
import { uploadPreviewMedia } from '@/lib/uploadPreviewMedia'
import { IS_CONVERSATION_PREVIEW_ENABLED } from './previewEnvironment'
import { stateLabel, toContextEntries } from './conversationContext'
import { downloadConversation } from './conversationsExport'
import { CONVERSATION_QUICK_REPLIES, quickReplyVariablesFor } from './quickReplies'

/**
 * Lado do cliente, para exercitar o fluxo sem um telefone real. Manda a INTENÇÃO ("mandou este
 * texto", "tocou neste botão") para a API, que monta o payload da Meta e o assina com o app secret —
 * que fica só no servidor. Assinar aqui obrigaria a publicar o segredo no bundle.
 *
 * Neste projeto o bot é o workflow do n8n, e a API não responde sozinha: o que se vê na thread ao
 * lado é a mensagem do cliente entrando. A resposta aparece quando o n8n estiver apontado para esta
 * instância.
 */
function SimulatorPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const client = useMemo(
    () =>
      createPreviewBridgeClient({
        from: conversationId,
        // `api` e não `fetch` na mão: é o cliente que carrega o access token e renova no 401.
        sendCommand: async (command) => {
          await api.post('/conversations/preview/inbound', command)
        },
      }),
    [conversationId]
  )

  return (
    <ConversationSimulatorPanel
      conversationId={conversationId}
      onClose={onClose}
      client={client}
      // Sem isto o painel esconde o microfone: nota de voz precisa de um id que o canal resolva,
      // e é o servidor que hospeda os bytes e devolve esse id.
      uploadMedia={uploadPreviewMedia}
      sse={conversationsSdkRealtime}
      loadMessages={(id) => conversationsSdkApi.fetchMessages(id)}
    />
  )
}

export function ConversationsPage() {
  const [searchParams] = useSearchParams()
  // Lido uma vez: o workspace usa como conversa inicial, e reagir a mudanças depois roubaria a
  // conversa que o atendente tivesse aberto na mão.
  const linkedNumber = searchParams.get(CONVERSATION_QUERY_PARAM) ?? undefined

  return (
    <ConversationsProvider api={conversationsSdkApi} sse={conversationsSdkRealtime}>
      <ConversationsWorkspace
        className="h-[calc(100vh-3.5rem)] md:h-screen"
        {...(linkedNumber ? { initialWhatsappNumber: linkedNumber } : {})}
        // O fluxo do bot pergunta e anota; responder por cima atropelaria a pergunta em aberto.
        requireTakeoverToReply
        contextEntriesOf={toContextEntries}
        flowLabelOf={(conversation) => stateLabel(conversation.currentState)}
        quickReplies={CONVERSATION_QUICK_REPLIES}
        // O nome vem do contexto do fluxo (o bot pergunta antes de anotar o pedido), não da listagem.
        quickReplyVariablesFor={(_conversation, context) =>
          quickReplyVariablesFor(typeof context?.['name'] === 'string' ? context['name'] : undefined)
        }
        // Pela rota de export, não pelo que está em tela: a listagem é paginada e o transcript
        // visível entregaria histórico truncado a quem quer auditoria.
        onDownload={(conversation) =>
          void downloadConversation({
            conversationId: conversation.id,
            whatsappNumber: conversation.whatsappNumber,
            ...(conversation.clientName ? { clientName: conversation.clientName } : {}),
          })
        }
        onAttach={async (conversation, file) => {
          await conversationsSdkApi.sendMedia(conversation.id, await fileToAttachment(file))
        }}
        simulator={{
          enabled: IS_CONVERSATION_PREVIEW_ENABLED,
          render: ({ conversationId, close }) => (
            <SimulatorPanel conversationId={conversationId} onClose={close} />
          ),
        }}
      />
    </ConversationsProvider>
  )
}
