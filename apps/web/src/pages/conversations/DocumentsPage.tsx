/**
 * Biblioteca de arquivos trocados no WhatsApp, de todas as conversas.
 *
 * Existe fora da inbox porque a pergunta é outra: quem procura um comprovante raramente lembra de
 * qual conversa ele veio. O componente é do @adatechnology/conversations-ui e fala com o mesmo
 * adapter da inbox — aqui só se monta a tela e se decide o que fazer ao abrir a conversa de origem.
 */

import { useNavigate } from 'react-router-dom'
import '@adatechnology/conversations-ui/styles.css'
import { ConversationsProvider, DocumentsWorkspace } from '@adatechnology/conversations-ui'

import { CONVERSATION_QUERY_PARAM } from '@/constants/conversationLinks'
import { conversationsSdkApi } from '@/lib/conversationsSdkApi'
import { conversationsSdkRealtime } from '@/lib/conversationsSdkRealtime'

export function DocumentsPage() {
  const navigate = useNavigate()

  function handleOpenConversation(conversationId: string): void {
    navigate(`/conversations?${CONVERSATION_QUERY_PARAM}=${encodeURIComponent(conversationId)}`)
  }

  return (
    <ConversationsProvider api={conversationsSdkApi} sse={conversationsSdkRealtime}>
      {/* Sem título próprio: o DocumentsWorkspace já desenha o seu, e dois viravam cabeçalho repetido. */}
      <div className="p-4 lg:p-6">
        <DocumentsWorkspace onOpenConversation={handleOpenConversation} />
      </div>
    </ConversationsProvider>
  )
}
