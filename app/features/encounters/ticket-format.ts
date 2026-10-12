const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const
const two = (n: number) => String(n).padStart(2, '0')

/** The face of a ticket: 24 hour clock time and a short date, both in the phone's own timezone. */
export function ticketTime(unixSeconds: number): { time: string; date: string } {
  const d = new Date(unixSeconds * 1000)
  return { time: `${two(d.getHours())}:${two(d.getMinutes())}`, date: `${two(d.getDate())} ${MONTHS[d.getMonth()]}` }
}
