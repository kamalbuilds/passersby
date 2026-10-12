export const LAMP_DAYS = 14

/** Which of the last 14 UTC days (oldest first, today last) hold at least one encounter. */
export function lampDays(encounterDays: Iterable<number>, today: number): boolean[] {
  const had = new Set(encounterDays)
  return Array.from({ length: LAMP_DAYS }, (_, i) => had.has(today - (LAMP_DAYS - 1 - i)))
}
