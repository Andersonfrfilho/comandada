/**
 * Nome de cada contato da lista de conversas.
 *
 * O @adatechnology/meta-whatsapp-module não guarda nome nenhum: o `clientName` do
 * `ConversationSummary` voltava sempre vazio e a lista mostrava só o telefone. O nome está no
 * cadastro do cliente: o que ele digitou ao bot (ou a equipe corrigiu) e, enquanto não há, o do
 * perfil do WhatsApp.
 */

import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { customers } from '@/infra/database/schema'

export interface ConversationContactNamesReader {
  /** Número do WhatsApp → nome; número sem nome conhecido fica de fora. */
  namesFor(establishmentId: string, whatsappNumbers: readonly string[]): Promise<Map<string, string>>
}

export interface ContactNameSource {
  readonly name: string
  readonly whatsappNumber: string
  readonly whatsappProfileName: string | null
}

/** Nome do cadastro quando já não é o número (que o bot grava no lugar); senão o do perfil. */
export function contactDisplayName(customer: ContactNameSource): string | null {
  const name = customer.name.trim()
  if (name && name !== customer.whatsappNumber) return name
  return customer.whatsappProfileName?.trim() || null
}

type Database = Pick<NodePgDatabase<Record<string, never>>, 'select'>

export class DrizzleConversationContactNamesReader implements ConversationContactNamesReader {
  constructor(private readonly db: Database) {}

  async namesFor(establishmentId: string, whatsappNumbers: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    if (whatsappNumbers.length === 0) return names

    const rows = await this.db
      .select({
        name: customers.name,
        whatsappNumber: customers.whatsappNumber,
        whatsappProfileName: customers.whatsappProfileName,
      })
      .from(customers)
      .where(and(eq(customers.establishmentId, establishmentId), inArray(customers.whatsappNumber, [...whatsappNumbers])))

    for (const row of rows) {
      const displayName = contactDisplayName(row)
      if (displayName) names.set(row.whatsappNumber, displayName)
    }
    return names
  }
}
