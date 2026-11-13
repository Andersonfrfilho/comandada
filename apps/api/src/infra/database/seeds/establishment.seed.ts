import { db } from '../connection'
import * as schema from '../schema'

export const ESTABLISHMENT_ID_FALLBACK = '00000000-0000-0000-0000-000000000001'
const ESTABLISHMENT_WHATSAPP_NUMBER = '5511999999999'

/**
 * scripts/seed-db.sh (CSV seeder) and this TS seeder both target the same
 * whatsappNumber (unique constraint). Whichever runs first wins the id —
 * resolve by whatsappNumber instead of assuming the fixed fallback id,
 * otherwise the second seeder's onConflictDoNothing() silently no-ops and
 * every FK-dependent insert that follows points at a non-existent row.
 */
export async function seedEstablishment(): Promise<string> {
  const existing = await db.query.establishments.findFirst({
    where: (establishment, { eq }) => eq(establishment.whatsappNumber, ESTABLISHMENT_WHATSAPP_NUMBER),
  })
  if (existing) return existing.id

  await db
    .insert(schema.establishments)
    .values({
      id: ESTABLISHMENT_ID_FALLBACK,
      name: 'Restaurante Demo',
      whatsappNumber: ESTABLISHMENT_WHATSAPP_NUMBER,
    })
    .onConflictDoNothing()

  const created = await db.query.establishments.findFirst({
    where: (establishment, { eq }) => eq(establishment.whatsappNumber, ESTABLISHMENT_WHATSAPP_NUMBER),
  })
  if (!created) throw new Error('Establishment seed failed: row not found after insert')
  return created.id
}
