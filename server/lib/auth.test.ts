import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, getAddressFromPublicKey, getBase58Decoder, signBytes } from "@solana/kit";
import { checkSignInMessage, issueSession, readSession, signInMessage, verifyWalletSignature } from "./auth";

const SECRET = "test-secret-0123456789";
const NOW = 1_800_000_000;
const S = { wallet: "W", identity: "I", tier: "seeker" as const, exp: NOW + 100 };

test("session token round trips and rejects tampering, wrong secret and expiry", () => {
  const t = issueSession(SECRET, S);
  assert.deepEqual(readSession(SECRET, t, NOW), S);
  assert.equal(readSession("other-secret-0123456789", t, NOW), null);
  assert.equal(readSession(SECRET, t, NOW + 100), null, "expired");
  const [p, m] = t.split(".");
  const forged = Buffer.from(Buffer.from(p, "base64url").toString().replace("seeker", "wallet")).toString("base64url");
  assert.equal(readSession(SECRET, `${forged}.${m}`, NOW), null);
  assert.equal(readSession(SECRET, "garbage", NOW), null);
});

test("sign-in message: signature, freshness, wallet binding", async () => {
  const kp = await generateKeyPair();
  const wallet = await getAddressFromPublicKey(kp.publicKey);
  const message = signInMessage(wallet, NOW);
  const sig = getBase58Decoder().decode(await signBytes(kp.privateKey, new TextEncoder().encode(message)));
  assert.equal(await verifyWalletSignature(wallet, message, sig), true);
  assert.equal(await verifyWalletSignature(wallet, message + " ", sig), false);
  assert.equal(checkSignInMessage(message, wallet, NOW + 299), null);
  assert.equal(checkSignInMessage(message, wallet, NOW + 301), "message_expired");
  assert.equal(checkSignInMessage(message, "Other", NOW), "wallet_mismatch");
  assert.equal(checkSignInMessage(message.replace("passersby", "headcount"), wallet, NOW), "malformed_message");
});
