import assert from 'node:assert/strict'
import { test } from 'node:test'
import { distanceFrac, hashAngle, place } from './street-geometry'

test('stronger signal stands closer to the lamp, and the ends are clamped', () => {
  assert.ok(distanceFrac(-50) < distanceFrac(-70))
  assert.ok(distanceFrac(-70) < distanceFrac(-90))
  assert.equal(distanceFrac(-20), distanceFrac(-40))
  assert.equal(distanceFrac(-120), distanceFrac(-95))
})

test('an angle is stable per token and differs between tokens', () => {
  const a = hashAngle('a3f09c11d2e47b88a3f09c11d2e47b88')
  assert.equal(a, hashAngle('a3f09c11d2e47b88a3f09c11d2e47b88'))
  assert.notEqual(a, hashAngle('a3f09c11d2e47b88a3f09c11d2e47b89'))
  assert.ok(a >= 0 && a < Math.PI * 2)
})

test('place puts a phone at exactly its RSSI distance from the lamp', () => {
  const { x, y } = place('00112233445566778899aabbccddeeff', -67.5, 100)
  assert.ok(Math.abs(Math.hypot(x, y) - distanceFrac(-67.5) * 100) < 1e-9)
})

test('tokens spread around the street instead of stacking on one side', () => {
  const quadrants = new Set<number>()
  for (let i = 0; i < 24; i++) {
    const { x, y } = place(`token-${i}`, -70, 100)
    quadrants.add((x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0))
  }
  assert.equal(quadrants.size, 4)
})
