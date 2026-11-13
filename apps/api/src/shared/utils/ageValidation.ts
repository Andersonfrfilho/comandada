/**
 * Calculates age from an ISO date string (YYYY-MM-DD).
 * Uses Brazil midnight to avoid timezone edge cases.
 */
export function calcAge(birthDate: string): number {
  const today = new Date()
  const dob = new Date(birthDate + 'T00:00:00-03:00')
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

export function isAdult(birthDate: string): boolean {
  return calcAge(birthDate) >= 18
}

export function requiresAdult(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false
  return !isAdult(birthDate)
}
