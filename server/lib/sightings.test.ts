import { test } from "node:test";
import assert from "node:assert/strict";
import { BeaconRegistry, EPOCH_SECONDS, epochOf, type Peer } from "./beacon";
import { createSightingProcessor } from "./sightings";
import { SightingStore } from "./store";

const A: Peer = { identity: "D2ehKLUQApN8ZxcANjwuTJC7bk7BMJn2voofXy17tCrs", wallet: "D2ehKLUQApN8ZxcANjwuTJC7bk7BMJn2voofXy17tCrs", tier: "wallet" };
const B: Peer = { identity: "5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj", wallet: "GhyXbXu7y3DVptMiSPBri12rGMxJBKtex4hWSa6bfg9j", tier: "seeker" };
const T = epochOf(1_800_000_000_000) * EPOCH_SECONDS * 1000;

function rig(failFirst = false) {
  const registry = new BeaconRegistry("test-secret-0123456789");
  const calls: [Peer, Peer][] = [];
  let failed = !failFirst;
  const proc = createSightingProcessor({
    registry,
    store: new SightingStore(),
    confirm: async (a, b) => {
      calls.push([a, b]);
      if (!failed) {
        failed = true;
        throw new Error("rpc down");
      }
      return { signature: `sig${calls.length}`, encounter: { address: "enc" } as never };
    },
  });
  const sight = (token: string) => [{ token, rssi: -60, at: T }];
  return { registry, calls, proc, sight };
}

test("one-directional sighting never confirms", async () => {
  const { registry, calls, proc, sight } = rig();
  const tb = registry.issue(B, T).token;
  registry.issue(A, T);
  for (let i = 0; i < 3; i++) assert.deepEqual(await proc(A, sight(tb), T + i * 1000), []);
  assert.equal(calls.length, 0);
});

test("mutual sighting confirms once and repeat batches return the same result", async () => {
  const { registry, calls, proc, sight } = rig();
  const ta = registry.issue(A, T).token;
  const tb = registry.issue(B, T).token;
  assert.deepEqual(await proc(A, sight(tb), T), []);
  const out = await proc(B, sight(ta), T + 1000);
  assert.equal(out.length, 1);
  assert.equal(out[0].other.identity, A.identity);
  assert.equal(out[0].signature, "sig1");
  assert.equal(calls.length, 1);
  // A posts again: learns about the confirmation without a second transaction
  const again = await proc(A, sight(tb), T + 10_000);
  assert.equal(again.length, 1);
  assert.equal(again[0].other.identity, B.identity);
  assert.equal(again[0].signature, "sig1");
  assert.equal(calls.length, 1);
});

test("self, unknown and stale tokens are ignored", async () => {
  const { registry, calls, proc, sight } = rig();
  const ta = registry.issue(A, T).token;
  assert.deepEqual(await proc(A, sight(ta), T), [], "self");
  assert.deepEqual(await proc(A, sight("ab".repeat(16)), T), [], "unknown");
  const tb = registry.issue(B, T).token;
  const later = T + 2 * EPOCH_SECONDS * 1000;
  assert.deepEqual(await proc(A, sight(tb), later), [], "two epochs old");
  assert.deepEqual(await proc(B, sight(ta), later), []);
  assert.equal(calls.length, 0);
});

test("a failed confirmation is retried by the next batch", async () => {
  const { registry, calls, proc, sight } = rig(true);
  const ta = registry.issue(A, T).token;
  const tb = registry.issue(B, T).token;
  await proc(A, sight(tb), T);
  assert.deepEqual(await proc(B, sight(ta), T + 1000), []);
  assert.equal(calls.length, 1);
  const retry = await proc(B, sight(ta), T + 11_000);
  assert.equal(retry.length, 1);
  assert.equal(calls.length, 2);
});
