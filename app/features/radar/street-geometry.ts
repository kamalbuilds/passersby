import { street } from '@/constants/theme'

/** FNV-1a with a murmur finaliser over the whole token, so the same token always lands at the same angle. */
export function hashAngle(token: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // murmur3 finaliser: FNV alone leaves the top bits of near-identical strings clustered.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return ((h >>> 0) / 0x100000000) * Math.PI * 2
}

/** RSSI to a fraction of the street radius: -40 dBm stands at the lamp's foot, -95 dBm at the edge of range. */
export function distanceFrac(rssi: number): number {
  const t = (street.rssiNear - rssi) / (street.rssiNear - street.rssiFar)
  const clamped = Math.min(1, Math.max(0, t))
  return street.nearFrac + (street.farFrac - street.nearFrac) * clamped
}

/** Centre-relative position of a phone on the street, in px, for a street of the given radius. */
export function place(token: string, rssi: number, radius: number): { x: number; y: number } {
  const a = hashAngle(token)
  const r = distanceFrac(rssi) * radius
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}
