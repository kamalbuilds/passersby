export const SECONDS_PER_DAY = 86_400

export const utcDay = (nowMs: number) => Math.floor(nowMs / 1000 / SECONDS_PER_DAY)

export function shortAddress(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a
}

export function relativeTime(thenSeconds: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000) - thenSeconds)
  if (diff < 45) return 'just now'
  if (diff < 90) return '1 min ago'
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`
  if (diff < 5400) return '1 h ago'
  if (diff < SECONDS_PER_DAY) return `${Math.round(diff / 3600)} h ago`
  const days = Math.floor(diff / SECONDS_PER_DAY)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(thenSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function countdown(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Current streak: the on-chain value counts only while the last encounter day is today or yesterday. */
export function liveStreak(streak: number, lastDay: number, today: number): number {
  return today - lastDay <= 1 ? streak : 0
}

/** Base units to a display string, trimming trailing zeros. */
export function formatUnits(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const frac = (amount % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}
