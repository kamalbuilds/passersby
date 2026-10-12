// Usage: tsx scripts/e2e.ts [baseUrl]   (default http://localhost:8080)
import assert from "node:assert/strict";
import {
  address,
  createSolanaRpc,
  generateKeyPair,
  getAddressEncoder,
  getAddressFromPublicKey,
  getBase58Decoder,
  getProgramDerivedAddress,
  signBytes,
  type Address,
} from "@solana/kit";
import { signInMessage } from "../lib/auth";
import { decodeEncounter, decodeProfile, DEFAULT_DEVNET_RPC, DEFAULT_PROGRAM_ID } from "../lib/chain";

const base = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const programId = address(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
const devnet = createSolanaRpc(process.env.DEVNET_RPC_URL ?? DEFAULT_DEVNET_RPC);
const enc = getAddressEncoder();
const utf8 = new TextEncoder();

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function newUser() {
  const kp = await generateKeyPair();
  const wallet = await getAddressFromPublicKey(kp.publicKey);
  const message = signInMessage(wallet, Math.floor(Date.now() / 1000));
  const signature = getBase58Decoder().decode(await signBytes(kp.privateKey, utf8.encode(message)));
  const s = await call("POST", "/session", { body: { wallet, message, signature } });
  assert.equal(s.status, 200, `session: ${JSON.stringify(s.json)}`);
  assert.equal(s.json.tier, "wallet", "fresh wallet has no SGT");
  assert.equal(s.json.identity, wallet);
  const bad = await call("POST", "/session", { body: { wallet, message, signature: signature.slice(0, -2) + (signature.endsWith("11") ? "22" : "11") } });
  assert.equal(bad.status, 401, "tampered signature must be rejected");
  const b = await call("GET", "/beacon", { token: s.json.sessionToken });
  assert.equal(b.status, 200, JSON.stringify(b.json));
  assert.match(b.json.token, /^[0-9a-f]{32}$/);
  return { wallet: wallet as Address, session: s.json.sessionToken as string, beacon: b.json as { token: string; epoch: number; expiresAt: number } };
}

async function pda(seeds: (Uint8Array | Address)[]) {
  const [a] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: seeds.map((s) => (typeof s === "string" ? enc.encode(s as Address) : s)),
  });
  return a;
}

async function main() {
  console.log(`target ${base}`);
  const health = await call("GET", "/health");
  assert.equal(health.status, 200);
  console.log("health", JSON.stringify(health.json));
  assert.equal((await call("GET", "/beacon")).status, 401, "beacon needs a session");

  const [a, b] = [await newUser(), await newUser()];
  assert.notEqual(a.beacon.token, b.beacon.token);
  console.log(`A ${a.wallet} token ${a.beacon.token} epoch ${a.beacon.epoch}`);
  console.log(`B ${b.wallet} token ${b.beacon.token} epoch ${b.beacon.epoch}`);

  const sighting = (token: string) => ({ sightings: [{ token, rssi: -58, at: Date.now() }] });

  const first = await call("POST", "/sightings", { token: a.session, body: sighting(b.beacon.token) });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.deepEqual(first.json.confirmed, [], "one-directional sighting must not confirm");
  assert.equal((await devnet.getAccountInfo(await pda([utf8.encode("profile"), a.wallet]), { encoding: "base64" }).send()).value, null, "nothing on-chain yet");
  console.log("A saw B: not confirmed (one-directional)");

  const t0 = Date.now();
  const mutual = await call("POST", "/sightings", { token: b.session, body: sighting(a.beacon.token) });
  assert.equal(mutual.status, 200, JSON.stringify(mutual.json));
  assert.equal(mutual.json.confirmed.length, 1, JSON.stringify(mutual.json));
  const c = mutual.json.confirmed[0];
  assert.equal(c.other.identity, a.wallet);
  assert.ok(typeof c.signature === "string" && c.signature.length > 40, "transaction signature returned");
  console.log(`B saw A: confirmed in ${Date.now() - t0} ms, signature ${c.signature}`);
  console.log("encounter", JSON.stringify(c.encounter));

  // read the account straight from devnet, independent of the server
  const [lo, hi] = Buffer.compare(Buffer.from(enc.encode(a.wallet)), Buffer.from(enc.encode(b.wallet))) < 0 ? [a, b] : [b, a];
  const day = Math.floor(Date.now() / 1000 / 86_400);
  const dayBytes = Buffer.alloc(4);
  dayBytes.writeUInt32LE(c.encounter.day);
  const encAddr = await pda([utf8.encode("encounter"), lo.wallet, hi.wallet, dayBytes]);
  const acct = await devnet.getAccountInfo(encAddr, { encoding: "base64", commitment: "confirmed" }).send();
  assert.ok(acct.value, "Encounter account exists on devnet");
  assert.equal(acct.value.owner, programId);
  const onchain = decodeEncounter(encAddr, Buffer.from(acct.value.data[0], "base64"));
  console.log("on-chain Encounter", JSON.stringify(onchain));
  assert.deepEqual([onchain.lo, onchain.hi], [lo.wallet, hi.wallet]);
  assert.deepEqual([onchain.loWallet, onchain.hiWallet], [lo.wallet, hi.wallet]);
  assert.equal(onchain.verified, false, "wallet-tier pair is unverified");
  assert.ok(Math.abs(onchain.day - day) <= 1);
  assert.equal(c.encounter.address, encAddr);

  for (const u of [a, b]) {
    const addr = await pda([utf8.encode("profile"), u.wallet]);
    const p = await devnet.getAccountInfo(addr, { encoding: "base64", commitment: "confirmed" }).send();
    assert.ok(p.value, `Profile for ${u.wallet} exists`);
    const prof = decodeProfile(addr, Buffer.from(p.value.data[0], "base64"));
    assert.deepEqual([prof.identity, prof.wallet, prof.tier, prof.encounters, prof.verifiedEncounters, prof.streak], [u.wallet, u.wallet, "wallet", 1, 0, 1]);
  }
  console.log("both Profile accounts on devnet: encounters 1, verified 0, streak 1");

  // A learns of the confirmation on its next batch, with no second transaction
  const again = await call("POST", "/sightings", { token: a.session, body: sighting(b.beacon.token) });
  assert.equal(again.json.confirmed.length, 1);
  assert.equal(again.json.confirmed[0].signature, c.signature);
  assert.equal(again.json.confirmed[0].other.identity, b.wallet);
  console.log("A re-posts: receives the same confirmation");

  const list = await call("GET", `/encounters?identity=${a.wallet}`);
  assert.equal(list.status, 200);
  assert.equal(list.json.encounters.length, 1);
  assert.equal(list.json.encounters[0].address, encAddr);
  assert.equal(list.json.profile.encounters, 1);
  console.log(`GET /encounters?identity=A: 1 encounter, profile.encounters ${list.json.profile.encounters}`);
  console.log("E2E PASS");
}

main().catch((e) => {
  console.error("E2E FAIL", e);
  process.exit(1);
});
