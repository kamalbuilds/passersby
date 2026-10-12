import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAMP_DAYS, lampDays } from './lamp-days'

test('lampDays lights exactly the days that had an encounter, oldest first and today last', () => {
  const lit = lampDays([100, 98, 87, 50, 101], 100)
  assert.equal(lit.length, LAMP_DAYS)
  assert.equal(lit[LAMP_DAYS - 1], true) // day 100, today
  assert.equal(lit[LAMP_DAYS - 3], true) // day 98
  assert.equal(lit[0], true) // day 87, thirteen days ago, the oldest lamp
  assert.equal(lit.filter(Boolean).length, 3)
})

test('lampDays leaves every lamp unlit when nothing happened in the window', () => {
  assert.deepEqual(lampDays([10, 200], 100), new Array(LAMP_DAYS).fill(false))
})
