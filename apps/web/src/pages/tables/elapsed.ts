/** "há 1 h 20 min" desde a abertura: o card da mesa mostra há quanto tempo ela está ocupada. */
export function elapsedLabel(since: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `há ${hours} h` : `há ${hours} h ${rest} min`
}
