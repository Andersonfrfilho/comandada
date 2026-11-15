/**
 * Página do histórico de uma conversa, da mensagem mais nova para a mais antiga.
 *
 * O `listMessages` do @adatechnology/meta-whatsapp-module ordena em ordem crescente antes do
 * `limit`: numa conversa com mais mensagens que a página, o painel recebia as MAIS ANTIGAS e nunca
 * as de hoje. Aqui a ordenação é decrescente antes do corte, que é o contrato que a tela espera
 * (`fetchMessages` inverte para desenhar de cima para baixo) e o que faz o `before` paginar para
 * trás em vez de repetir o começo da conversa.
 */

import { and, desc, eq, lt } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { messages, sessions, type MessageRow } from '@adatechnology/meta-whatsapp-module'

export interface ConversationHistoryPage {
  readonly companyId: string
  readonly whatsappNumber: string
  readonly limit: number
  /** Instante ISO: só mensagens anteriores a ele. */
  readonly before?: string | undefined
}

export interface ConversationHistoryReader {
  /** `undefined` quando a conversa não existe; lista vazia quando existe sem mensagens. */
  recentMessages(page: ConversationHistoryPage): Promise<MessageRow[] | undefined>
}

type Database = Pick<NodePgDatabase<Record<string, never>>, 'select'>

export class DrizzleConversationHistoryReader implements ConversationHistoryReader {
  constructor(private readonly db: Database) {}

  async recentMessages(page: ConversationHistoryPage): Promise<MessageRow[] | undefined> {
    const [session] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.companyId, page.companyId), eq(sessions.whatsappNumber, page.whatsappNumber)))
      .limit(1)
    if (!session) return undefined

    const conditions = [eq(messages.companyId, page.companyId), eq(messages.sessionId, session.id)]
    const before = page.before ? new Date(page.before) : undefined
    if (before && !Number.isNaN(before.getTime())) conditions.push(lt(messages.createdAt, before))

    return this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(page.limit)
  }
}
