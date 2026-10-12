import { test } from "node:test";
import assert from "node:assert/strict";
import { address, getAddressEncoder } from "@solana/kit";
import { attestationMessage, ed25519Instruction, decodeEncounter, ENCOUNTER_SIZE } from "./chain";

const enc = getAddressEncoder();
const k = (s: string) => address(s);
const A = k("D2ehKLUQApN8ZxcANjwuTJC7bk7BMJn2voofXy17tCrs");
const B = k("5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj");
const C = k("GhyXbXu7y3DVptMiSPBri12rGMxJBKtex4hWSa6bfg9j");
const D = k("3BySLyP6nGFKDfFdfcsuT4ZmcndDsnsiLsHMCToT5i5V");

test("attestation message is domain || lo || hi || lo_wallet || hi_wallet || tiers || day LE || seen_at LE", () => {
  const m = Buffer.from(attestationMessage({ lo: A, hi: B, loWallet: C, hiWallet: D, loTier: 1, hiTier: 0, day: 20_000, seenAt: 1_728_000_123 }));
  assert.equal(m.length, 154);
  assert.equal(m.subarray(0, 12).toString(), "passersby:v1");
  assert.deepEqual(m.subarray(12, 44), Buffer.from(enc.encode(A)));
  assert.deepEqual(m.subarray(44, 76), Buffer.from(enc.encode(B)));
  assert.deepEqual(m.subarray(76, 108), Buffer.from(enc.encode(C)));
  assert.deepEqual(m.subarray(108, 140), Buffer.from(enc.encode(D)));
  assert.equal(m[140], 1);
  assert.equal(m[141], 0);
  assert.equal(m.readUInt32LE(142), 20_000);
  assert.equal(m.readBigInt64LE(146), 1_728_000_123n);
});

test("ed25519 instruction layout matches the offsets the program checks", () => {
  const msg = Buffer.alloc(154, 7);
  const pk = Buffer.alloc(32, 1);
  const sig = Buffer.alloc(64, 2);
  const ix = ed25519Instruction(pk, sig, msg);
  const d = Buffer.from(ix.data!);
  assert.equal(d[0], 1);
  assert.equal(d.readUInt16LE(4), 0xffff);
  assert.equal(d.readUInt16LE(8), 0xffff);
  assert.equal(d.readUInt16LE(14), 0xffff);
  const [pkOff, msgOff, msgLen, sigOff] = [d.readUInt16LE(6), d.readUInt16LE(10), d.readUInt16LE(12), d.readUInt16LE(2)];
  assert.deepEqual(d.subarray(pkOff, pkOff + 32), pk);
  assert.deepEqual(d.subarray(sigOff, sigOff + 64), sig);
  assert.deepEqual(d.subarray(msgOff, msgOff + msgLen), msg);
  assert.equal(ix.programAddress, "Ed25519SigVerify111111111111111111111111111");
});

test("Encounter decoder rejects wrong size and wrong discriminator", () => {
  assert.throws(() => decodeEncounter("x", new Uint8Array(ENCOUNTER_SIZE)), /not an Encounter/);
  assert.throws(() => decodeEncounter("x", new Uint8Array(10)), /not an Encounter/);
});
