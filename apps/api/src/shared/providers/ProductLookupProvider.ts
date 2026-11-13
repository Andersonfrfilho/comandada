import { z } from 'zod'

// Resposta de terceiro é entrada não confiável e passa pela mesma régua de qualquer
// outra fronteira. Campos opcionais são cortados em vez de reprovarem a sugestão
// inteira: um item sem imagem ainda serve para preencher o nome.
export const productSuggestionSchema = z.object({
  name: z.string().min(1).max(255),
  brand: z.string().max(255).optional(),
  barcode: z.string().max(20).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  category: z.string().max(255).optional(),
  /** NCM só vem de provider fiscal; a OpenFoodFacts não tem esse dado. */
  ncmCode: z.string().regex(/^\d{8}$/).optional(),
  /** Qual provider respondeu — o usuário precisa saber a procedência do que aceitou. */
  source: z.string().max(50).optional(),
})

// Derivado do schema em vez de declarado à parte: com `exactOptionalPropertyTypes`,
// as duas formas divergem no `| undefined` dos opcionais e o schema é a fonte da verdade.
export type ProductSuggestion = Readonly<z.infer<typeof productSuggestionSchema>>

export interface ProductLookupProvider {
  /** Identifica a origem do dado em log e no campo `source` da sugestão. */
  readonly name: string
  search(query: string): Promise<readonly ProductSuggestion[]>
  getByBarcode(barcode: string): Promise<ProductSuggestion | null>
}
