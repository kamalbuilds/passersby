import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ticketTime } from './ticket-format'

// ticketTime reads the phone's timezone; pin it so the expected clock time is the same on every machine.
process.env.TZ = 'UTC'

test('ticketTime formats a unix timestamp as a clock time and a short date', () => {
  // 2026-10-12 21:04:36 UTC
  assert.deepEqual(ticketTime(1791839076), { time: '21:04', date: '12 OCT' })
})

test('ticketTime zero pads both the hour and the day', () => {
  // 2026-01-05 03:07:00 UTC
  assert.deepEqual(ticketTime(1767582420), { time: '03:07', date: '05 JAN' })
})
