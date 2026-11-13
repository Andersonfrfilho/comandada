import { z } from 'zod'

export const regionalPriceQuerySchema = z.object({
  /** GTIN/EAN — é a única chave que os portais de NFC-e aceitam para cruzar produto. */
  barcode: z.string().regex(/^\d{8,14}$/),
  postalCode: z.string().regex(/^\d{8}$/),
  radiusKm: z.number().int().positive().max(15),
})

export type RegionalPriceQuery = Readonly<z.infer<typeof regionalPriceQuerySchema>>

export const regionalPriceQuoteSchema = z.object({
  minPrice: z.number().nonnegative(),
  averagePrice: z.number().nonnegative(),
  maxPrice: z.number().nonnegative(),
  /** Quantas notas sustentam o número: sem isso, mínimo e máximo podem ser a mesma venda. */
  sampleCount: z.number().int().positive(),
  /** Data da coleta mais recente da amostra. Preço sem data engana. */
  collectedAt: z.string().datetime(),
  /** UF coberta pela consulta — a cobertura é estadual, nunca nacional. */
  state: z.string().length(2),
  source: z.string().max(50),
})

export type RegionalPriceQuote = Readonly<z.infer<typeof regionalPriceQuoteSchema>>

/**
 * Preço praticado na região, quando disponível.
 *
 * Não existe base nacional: o dado vem dos programas de transparência de NFC-e das
 * SEFAZ estaduais, então cada implementação cobre **uma** UF e o contrato muda por
 * estado. Ausência de resposta é o caso normal, não erro — devolve `null`.
 */
export interface RegionalPriceProvider {
  /** Identifica a procedência do número na tela e no log. */
  readonly name: string
  /** UF coberta por esta implementação, em sigla maiúscula. */
  readonly state: string
  getQuote(query: RegionalPriceQuery): Promise<RegionalPriceQuote | null>
}

/** Quem escolhe o provider pela UF do estabelecimento — é isso que o controller consome. */
export interface RegionalPriceResolver {
  getQuoteForState(state: string, query: RegionalPriceQuery): Promise<RegionalPriceQuote | null>
}
