import { test } from "node:test";
import assert from "node:assert/strict";
import { BeaconRegistry, beaconToken, EPOCH_SECONDS, epochOf } from "./beacon";

const A = "D2ehKLUQApN8ZxcANjwuTJC7bk7BMJn2voofXy17tCrs";
const B = "5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj";
const SECRET = "test-secret-0123456789";
const T = 1_800_000_000_000;

test("beacon token is deterministic per epoch and differs across epochs and identities", () => {
  const e = epochOf(T);
  const t = beaconToken(SECRET, A, e);
  assert.match(t, /^[0-9a-f]{32}$/);
  assert.equal(beaconToken(SECRET, A, e), t);
  assert.notEqual(beaconToken(SECRET, A, e + 1), t);
  assert.notEqual(beaconToken(SECRET, A, e - 1), t);
  assert.notEqual(beaconToken(SECRET, B, e), t);
  assert.notEqual(beaconToken("another-secret-0123456789", A, e), t);
  // every epoch in a day is distinct
  const day = new Set(Array.from({ length: 288 }, (_, i) => beaconToken(SECRET, A, e + i)));
  assert.equal(day.size, 288);
});

test("registry issues the same token within an epoch and rotates at the boundary", () => {
  const r = new BeaconRegistry(SECRET);
  const peer = { identity: A, wallet: A, tier: "wallet" as const };
  const start = epochOf(T) * EPOCH_SECONDS * 1000;
  const first = r.issue(peer, start + 1_000);
  const again = r.issue(peer, start + 299_000);
  const next = r.issue(peer, start + 300_000);
  assert.equal(first.token, again.token);
  assert.notEqual(first.token, next.token);
  assert.equal(first.expiresAt, (first.epoch + 1) * EPOCH_SECONDS);
  assert.equal(next.epoch, first.epoch + 1);
});

test("registry resolves current and previous epoch only", () => {
  const r = new BeaconRegistry(SECRET);
  const peer = { identity: B, wallet: A, tier: "seeker" as const };
  const start = epochOf(T) * EPOCH_SECONDS * 1000;
  const { token } = r.issue(peer, start);
  const hit = r.resolve(token, start + 1);
  assert.deepEqual(hit && { i: hit.identity, w: hit.wallet, t: hit.tier }, { i: B, w: A, t: "seeker" });
  assert.ok(r.resolve(token, start + EPOCH_SECONDS * 1000), "previous epoch still resolves");
  assert.equal(r.resolve(token, start + 2 * EPOCH_SECONDS * 1000), null, "two epochs old is stale");
  assert.equal(r.resolve("00".repeat(16), start), null, "unknown token");
  assert.ok(r.resolve(token.toUpperCase(), start), "hex case is irrelevant");
});

test("beacon memory is bounded and recovers after expiry", async () => {
  const { getBase58Decoder } = await import("@solana/kit");
  const r = new BeaconRegistry(SECRET);
  for (let i = 0; i < 10_000; i++) {
    const bytes = Buffer.alloc(32);
    bytes.writeUInt32LE(i + 1);
    const identity = getBase58Decoder().decode(bytes);
    r.issue({ identity, wallet: identity, tier: "wallet" }, T);
  }
  const peer = { identity: A, wallet: A, tier: "wallet" as const };
  assert.throws(() => r.issue(peer, T), /capacity/);
  assert.equal((r as unknown as { map: Map<string, unknown> }).map.size, 10_000);
  assert.ok(r.issue(peer, T + 2 * EPOCH_SECONDS * 1000).token);
});
