import { sha256 } from '@noble/hashes/sha2.js'

export const GLYPH_COLS = 5
export const GLYPH_ROWS = 5

/** A mirrored 5x5 on/off grid derived from the address, so the same person always draws the same glyph. */
export function glyphCells(seed: string): boolean[][] {
  const h = sha256(new TextEncoder().encode(seed))
  const rows: boolean[][] = []
  for (let r = 0; r < GLYPH_ROWS; r++) {
    const half = [0, 1, 2].map((c) => ((h[r * 3 + c] ?? 0) & 1) === 1)
    rows.push([half[0], half[1], half[2], half[1], half[0]])
  }
  return rows
}
