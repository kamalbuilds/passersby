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


test("relayer has a global daily attempt budget including failed attempts", async () => {
  const registry = new BeaconRegistry("test-secret-0123456789");
  let calls = 0;
  const proc = createSightingProcessor({ registry, store: new SightingStore(),
    confirm: async () => { calls++; throw new Error("transaction failed after charging fee"); } });
  const ta = registry.issue(A, T).token;
  const tb = registry.issue(B, T).token;
  const sight = (token: string, at: number) => [{ token, rssi: -60, at }];
  await proc(A, sight(tb, T), T);
  for (let i = 0; i < 105; i++) await proc(B, sight(ta, T), T);
  assert.equal(calls, 100, "failures must consume the budget and retries must stop");
  const tomorrow = T + 86_400_000;
  const ta2 = registry.issue(A, tomorrow).token;
  const tb2 = registry.issue(B, tomorrow).token;
  await proc(A, sight(tb2, tomorrow), tomorrow);
  await proc(B, sight(ta2, tomorrow), tomorrow);
  assert.equal(calls, 101, "budget resets on the next UTC day");
});

test("Sybil pairs share the global relay budget", async () => {
  const { getBase58Decoder } = await import("@solana/kit");
  const registry = new BeaconRegistry("test-secret-0123456789");
  let calls = 0;
  const proc = createSightingProcessor({ registry, store: new SightingStore(),
    confirm: async () => { calls++; return { signature: "sig", encounter: { address: "enc" } as never }; } });
  const ta = registry.issue(A, T).token;
  for (let i = 1; i <= 105; i++) {
    const bytes = new Uint8Array(32);
    bytes[0] = i;
    const identity = getBase58Decoder().decode(bytes);
    const peer: Peer = { identity, wallet: identity, tier: "wallet" };
    const tb = registry.issue(peer, T).token;
    await proc(A, [{ token: tb, rssi: -60, at: T }], T);
    const out = await proc(peer, [{ token: ta, rssi: -60, at: T }], T);
    assert.equal(out.length, i <= 100 ? 1 : 0);
  }
  assert.equal(calls, 100);
});

test("relay budget survives a processor restart and rejects corrupt state", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "relay-budget-"));
  const budgetPath = join(dir, "budget.json");
  try {
    const registry = new BeaconRegistry("test-secret-0123456789");
    const ta = registry.issue(A, T).token;
    const tb = registry.issue(B, T).token;
    let calls = 0;
    const deps = { registry, budgetPath, confirm: async () => { calls++; throw new Error("failed"); } };
    let proc = createSightingProcessor({ ...deps, store: new SightingStore() });
    const sight = (token: string) => [{ token, rssi: -60, at: T }];
    await proc(A, sight(tb), T);
    for (let i = 0; i < 60; i++) await proc(B, sight(ta), T);
    proc = createSightingProcessor({ ...deps, store: new SightingStore() });
    await proc(A, sight(tb), T);
    for (let i = 0; i < 60; i++) await proc(B, sight(ta), T);
    assert.equal(calls, 100);
    writeFileSync(budgetPath, JSON.stringify({ day: 0, attempts: -1 }));
    assert.throws(() => createSightingProcessor({ ...deps, store: new SightingStore() }), /invalid relay budget/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("different identities on the same wallet cannot self-confirm", async () => {
  const { registry, calls, proc, sight } = rig();
  const alias = { ...B, wallet: A.wallet };
  const ta = registry.issue(A, T).token;
  const tb = registry.issue(alias, T).token;
  assert.deepEqual(await proc(A, sight(tb), T), []);
  assert.deepEqual(await proc(alias, sight(ta), T), []);
  assert.equal(calls.length, 0);
});
