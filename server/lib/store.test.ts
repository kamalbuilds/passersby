import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGHTING_TTL_MS, SightingStore } from "./store";

const T = 1_800_000_000_000;

test("one-directional sighting does not confirm, mutual sighting does", () => {
  const s = new SightingStore();
  assert.equal(s.observe("A", "B", 100, T), false);
  assert.equal(s.observe("A", "B", 100, T + 1000), false, "A seeing B again is still one-directional");
  assert.equal(s.observe("B", "A", 100, T + 2000), true);
  assert.equal(s.observe("A", "C", 100, T + 3000), false, "unrelated pair");
});

test("reverse sighting counts in the same or adjacent epoch only", () => {
  for (const [eb, want] of [[99, true], [100, true], [101, true], [98, false], [102, false]] as const) {
    const s = new SightingStore();
    s.observe("A", "B", 100, T);
    assert.equal(s.observe("B", "A", eb, T + 1000), want, `epoch ${eb}`);
  }
});

test("sightings expire after 15 minutes", () => {
  const s = new SightingStore();
  s.observe("A", "B", 100, T);
  assert.equal(s.observe("B", "A", 100, T + SIGHTING_TTL_MS + 1), false);
  const s2 = new SightingStore();
  s2.observe("A", "B", 100, T);
  assert.equal(s2.observe("B", "A", 100, T + SIGHTING_TTL_MS - 1), true);
});

test("sighting memory is bounded and capacity cannot create a mutual match", () => {
  const s = new SightingStore();
  for (let i = 0; i < 10_000; i++) s.observe(`A${i}`, "B", 100, T);
  assert.equal(s.observe("B", "A0", 100, T), false, "new direction rejected at capacity");
  assert.equal((s as unknown as { seen: Map<string, unknown> }).seen.size, 10_000);
  assert.equal(s.observe("B", "A0", 100, T + SIGHTING_TTL_MS + 1), false, "expired reverse is gone");
  assert.equal(s.observe("A0", "B", 100, T + SIGHTING_TTL_MS + 2), true, "capacity recovers after expiry");
});
