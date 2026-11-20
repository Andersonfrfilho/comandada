import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { cleanProfileName, customerNameFromProfile } from '../../shared/whatsAppProfileName'

type Database = NodePgDatabase<typeof schema>

export interface FindOrCreateCustomerParams {
  establishmentId: string
  whatsappNumber: string
  name?: string | undefined
}

export class BotCustomerService {
  constructor(private readonly db: Database) {}

  async findByNumber(params: { establishmentId: string; whatsappNumber: string }): Promise<schema.Customer | undefined> {
    return this.db.query.customers.findFirst({
      where: and(
        eq(schema.customers.establishmentId, params.establishmentId),
        eq(schema.customers.whatsappNumber, params.whatsappNumber)
      ),
    })
  }

  // The customer row needs a name; until the bot learns it, the number stands in for it.
  async findOrCreate(params: FindOrCreateCustomerParams): Promise<schema.Customer> {
    const existing = await this.findByNumber(params)
    if (existing) {
      if (params.name && existing.name !== params.name) return this.rename(existing.id, params.name)
      return existing
    }
    const [created] = await this.db
      .insert(schema.customers)
      .values({
        establishmentId: params.establishmentId,
        whatsappNumber: params.whatsappNumber,
        phone: params.whatsappNumber,
        name: params.name ?? params.whatsappNumber,
      })
      .returning()
    if (!created) throw new Error('Failed to create customer')
    return created
  }

  /**
   * Nome do perfil do WhatsApp que veio com a mensagem. Grava o cliente na primeira mensagem (o
   * painel mostra o nome na lista de conversas) e, enquanto o nome dele ainda é o número, usa o do
   * perfil quando o bot aceitaria. Nome que o cliente digitou ou a equipe corrigiu não é trocado.
   */
  async recordProfileName(params: {
    establishmentId: string
    whatsappNumber: string
    profileName: string
  }): Promise<schema.Customer | undefined> {
    const profileName = cleanProfileName(params.profileName)
    if (!profileName) return this.findByNumber(params)
    const customerName = customerNameFromProfile(profileName)

    const existing = await this.findByNumber(params)
    if (!existing) {
      const [created] = await this.db
        .insert(schema.customers)
        .values({
          establishmentId: params.establishmentId,
          whatsappNumber: params.whatsappNumber,
          phone: params.whatsappNumber,
          name: customerName ?? params.whatsappNumber,
          whatsappProfileName: profileName,
        })
        .returning()
      return created
    }

    const adoptName = existing.name === existing.whatsappNumber && customerName !== null
    if (existing.whatsappProfileName === profileName && !adoptName) return existing
    const [updated] = await this.db
      .update(schema.customers)
      .set({
        whatsappProfileName: profileName,
        ...(adoptName ? { name: customerName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.customers.id, existing.id))
      .returning()
    return updated ?? existing
  }

  // Resposta do cliente à pergunta do bot sobre novidades; é o que libera o lembrete do workflow 04.
  async setMarketingOptIn(params: {
    establishmentId: string
    whatsappNumber: string
    optIn: boolean
  }): Promise<schema.Customer> {
    const customer = await this.findOrCreate(params)
    const now = new Date()
    const [updated] = await this.db
      .update(schema.customers)
      .set({ marketingOptIn: params.optIn, marketingOptInAt: now, updatedAt: now })
      .where(eq(schema.customers.id, customer.id))
      .returning()
    if (!updated) throw new Error('Failed to save marketing opt-in')
    return updated
  }

  private async rename(customerId: string, name: string): Promise<schema.Customer> {
    const [updated] = await this.db
      .update(schema.customers)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.customers.id, customerId))
      .returning()
    if (!updated) throw new Error('Failed to rename customer')
    return updated
  }
}
