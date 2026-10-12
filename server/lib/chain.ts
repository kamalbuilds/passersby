import { createHash } from "node:crypto";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairFromBytes,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressEncoder,
  getAddressFromPublicKey,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signBytes,
  signTransactionMessageWithSigners,
  type Address,
  type Base58EncodedBytes,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import type { Peer } from "./beacon";

export const DEFAULT_PROGRAM_ID = "H15pvqJFh7isY3fMX4oZe2ezZ8xjM4RZmv2uemQhv1g2";
export const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const ED25519_PROGRAM = address("Ed25519SigVerify111111111111111111111111111");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const INSTRUCTIONS_SYSVAR = address("Sysvar1nstructions1111111111111111111111111");

export const ATTEST_PREFIX = new TextEncoder().encode("passersby:v1");
export const ENCOUNTER_SIZE = 150;
export const PROFILE_SIZE = 92;
const TIER = { wallet: 0, seeker: 1 } as const;

const addrEnc = getAddressEncoder();
const b58 = getBase58Decoder();
const b58Enc = getBase58Encoder();
const disc = (name: string) => createHash("sha256").update(name).digest().subarray(0, 8);

export type EncounterJson = {
  address: string;
  lo: string;
  hi: string;
  loWallet: string;
  hiWallet: string;
  day: number;
  verified: boolean;
  firstSeen: number;
};
export type ProfileJson = {
  address: string;
  identity: string;
  wallet: string;
  tier: "seeker" | "wallet";
  encounters: number;
  verifiedEncounters: number;
  streak: number;
  lastDay: number;
  wavesReceived: number;
};
export type Confirmation = { signature: string | null; encounter: EncounterJson };

export type EncounterArgs = {
  lo: Address;
  hi: Address;
  loWallet: Address;
  hiWallet: Address;
  loTier: number;
  hiTier: number;
  day: number;
  seenAt: number;
};

/** b"passersby:v1" || lo || hi || lo_wallet || hi_wallet || lo_tier || hi_tier || day u32 LE || seen_at i64 LE */
export function attestationMessage(a: EncounterArgs): Uint8Array {
  const out = Buffer.alloc(ATTEST_PREFIX.length + 128 + 2 + 4 + 8);
  let o = 0;
  out.set(ATTEST_PREFIX, o);
  o += ATTEST_PREFIX.length;
  for (const k of [a.lo, a.hi, a.loWallet, a.hiWallet]) {
    out.set(addrEnc.encode(k), o);
    o += 32;
  }
  out[o++] = a.loTier;
  out[o++] = a.hiTier;
  out.writeUInt32LE(a.day, o);
  o += 4;
  out.writeBigInt64LE(BigInt(a.seenAt), o);
  return out;
}

/** Single-signature Ed25519 verify instruction, all offsets self-referencing (u16::MAX). */
export function ed25519Instruction(pubkey: Uint8Array, signature: Uint8Array, message: Uint8Array): Instruction {
  const data = Buffer.alloc(16 + 32 + 64 + message.length);
  data[0] = 1;
  data.writeUInt16LE(16 + 32, 2); // signature offset
  data.writeUInt16LE(0xffff, 4);
  data.writeUInt16LE(16, 6); // public key offset
  data.writeUInt16LE(0xffff, 8);
  data.writeUInt16LE(16 + 32 + 64, 10); // message offset
  data.writeUInt16LE(message.length, 12);
  data.writeUInt16LE(0xffff, 14);
  data.set(pubkey, 16);
  data.set(signature, 16 + 32);
  data.set(message, 16 + 32 + 64);
  return { programAddress: ED25519_PROGRAM, data };
}

const cmp = (a: Address, b: Address) => Buffer.compare(Buffer.from(addrEnc.encode(a)), Buffer.from(addrEnc.encode(b)));

export function decodeEncounter(addr: string, bytes: Uint8Array): EncounterJson {
  const d = Buffer.from(bytes);
  if (d.length !== ENCOUNTER_SIZE || !d.subarray(0, 8).equals(disc("account:Encounter"))) throw new Error("not an Encounter account");
  const pk = (o: number) => b58.decode(d.subarray(o, o + 32));
  return {
    address: addr,
    lo: pk(8),
    hi: pk(40),
    loWallet: pk(72),
    hiWallet: pk(104),
    day: d.readUInt32LE(136),
    verified: d[140] === 1,
    firstSeen: Number(d.readBigInt64LE(141)),
  };
}

export function decodeProfile(addr: string, bytes: Uint8Array): ProfileJson {
  const d = Buffer.from(bytes);
  if (d.length !== PROFILE_SIZE || !d.subarray(0, 8).equals(disc("account:Profile"))) throw new Error("not a Profile account");
  return {
    address: addr,
    identity: b58.decode(d.subarray(8, 40)),
    wallet: b58.decode(d.subarray(40, 72)),
    tier: d[72] === 1 ? "seeker" : "wallet",
    encounters: d.readUInt32LE(73),
    verifiedEncounters: d.readUInt32LE(77),
    streak: d.readUInt16LE(81),
    lastDay: d.readUInt32LE(83),
    wavesReceived: d.readUInt32LE(87),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Rpc = ReturnType<typeof createSolanaRpc>;

/** Signs with `payer`, sends, and polls until the signature is confirmed or failed on-chain. */
export async function sendInstructions(rpc: Rpc, payer: KeyPairSigner, ixs: Instruction[], timeoutMs = 60_000): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
    (m) => signTransactionMessageWithSigners(m),
  );
  const signature = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" })
    .send();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const s = value[0];
    if (s?.err) throw new Error(`transaction ${signature} failed: ${JSON.stringify(s.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return signature;
    await sleep(700);
  }
  throw new Error(`transaction ${signature} not confirmed within ${timeoutMs}ms`);
}

export class Chain {
  readonly rpc;
  private constructor(
    rpcUrl: string,
    readonly programId: Address,
    private attestorKeys: CryptoKeyPair,
    private attestorAddress: Address,
    private relayer: KeyPairSigner,
  ) {
    this.rpc = createSolanaRpc(rpcUrl);
  }

  static async create(o: { rpcUrl: string; programId: string; attestorSecretB58: string; relayerSecretB58: string }) {
    const att = b58Enc.encode(o.attestorSecretB58);
    const rel = b58Enc.encode(o.relayerSecretB58);
    if (att.length !== 64) throw new Error("ATTESTOR_SECRET_KEY must be a base58 64-byte keypair");
    if (rel.length !== 64) throw new Error("RELAYER_SECRET_KEY must be a base58 64-byte keypair");
    const keys = await createKeyPairFromBytes(att);
    return new Chain(
      o.rpcUrl,
      address(o.programId),
      keys,
      await getAddressFromPublicKey(keys.publicKey),
      await createKeyPairSignerFromBytes(rel),
    );
  }

  get attestor() {
    return this.attestorAddress;
  }
  get relayerAddress() {
    return this.relayer.address;
  }

  async pda(seeds: (Uint8Array | Address)[]): Promise<Address> {
    const [a] = await getProgramDerivedAddress({
      programAddress: this.programId,
      seeds: seeds.map((s) => (typeof s === "string" ? addrEnc.encode(s as Address) : s)),
    });
    return a;
  }
  profileAddress = (identity: Address) => this.pda([new TextEncoder().encode("profile"), identity]);
  encounterAddress = (lo: Address, hi: Address, day: number) => {
    const d = Buffer.alloc(4);
    d.writeUInt32LE(day);
    return this.pda([new TextEncoder().encode("encounter"), lo, hi, d]);
  };

  async getEncounter(addr: Address): Promise<EncounterJson | null> {
    const res = await this.rpc.getAccountInfo(addr, { encoding: "base64", commitment: "confirmed" }).send();
    if (!res.value) return null;
    return decodeEncounter(addr, Buffer.from(res.value.data[0], "base64"));
  }

  async getProfile(identity: Address): Promise<ProfileJson | null> {
    const addr = await this.profileAddress(identity);
    const res = await this.rpc.getAccountInfo(addr, { encoding: "base64", commitment: "confirmed" }).send();
    if (!res.value) return null;
    return decodeProfile(addr, Buffer.from(res.value.data[0], "base64"));
  }

  /** On-chain encounters where `identity` is lo or hi, newest first. */
  async getEncounters(identity: Address): Promise<EncounterJson[]> {
    const find = async (offset: bigint) => {
      const rows = await this.rpc
        .getProgramAccounts(this.programId, {
          encoding: "base64",
          commitment: "confirmed",
          filters: [
            { dataSize: BigInt(ENCOUNTER_SIZE) },
            { memcmp: { offset, bytes: identity as unknown as Base58EncodedBytes, encoding: "base58" } },
          ],
        })
        .send();
      return rows.map((r) => decodeEncounter(r.pubkey, Buffer.from(r.account.data[0], "base64")));
    };
    const all = [...(await find(8n)), ...(await find(40n))];
    return all.sort((a, b) => b.firstSeen - a.firstSeen);
  }

  /** Attest, relay and confirm one encounter. If it already exists on-chain, returns the existing account. */
  async confirmEncounter(a: Peer, b: Peer, nowMs: number): Promise<Confirmation> {
    const [lo, hi] = cmp(address(a.identity), address(b.identity)) < 0 ? [a, b] : [b, a];
    const seenAt = Math.floor(nowMs / 1000);
    const args: EncounterArgs = {
      lo: address(lo.identity),
      hi: address(hi.identity),
      loWallet: address(lo.wallet),
      hiWallet: address(hi.wallet),
      loTier: TIER[lo.tier],
      hiTier: TIER[hi.tier],
      day: Math.floor(seenAt / 86_400),
      seenAt,
    };
    const encounter = await this.encounterAddress(args.lo, args.hi, args.day);
    const existing = await this.getEncounter(encounter);
    if (existing) return { signature: null, encounter: existing };

    const message = attestationMessage(args);
    const sig = await signBytes(this.attestorKeys.privateKey, message);
    const edIx = ed25519Instruction(Buffer.from(addrEnc.encode(this.attestorAddress)), sig, message);

    const data = Buffer.alloc(8 + 128 + 2 + 4 + 8);
    data.set(disc("global:record_encounter"), 0);
    let o = 8;
    for (const k of [args.lo, args.hi, args.loWallet, args.hiWallet]) {
      data.set(addrEnc.encode(k), o);
      o += 32;
    }
    data[o++] = args.loTier;
    data[o++] = args.hiTier;
    data.writeUInt32LE(args.day, o);
    o += 4;
    data.writeBigInt64LE(BigInt(args.seenAt), o);

    const recordIx: Instruction = {
      programAddress: this.programId,
      accounts: [
        { address: this.relayer.address, role: AccountRole.WRITABLE_SIGNER },
        { address: await this.pda([new TextEncoder().encode("config")]), role: AccountRole.READONLY },
        { address: await this.profileAddress(args.lo), role: AccountRole.WRITABLE },
        { address: await this.profileAddress(args.hi), role: AccountRole.WRITABLE },
        { address: encounter, role: AccountRole.WRITABLE },
        { address: INSTRUCTIONS_SYSVAR, role: AccountRole.READONLY },
        { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      ],
      data,
    };

    let signature: string;
    try {
      signature = await sendInstructions(this.rpc, this.relayer, [edIx, recordIx]);
    } catch (e) {
      const raced = await this.getEncounter(encounter);
      if (raced) return { signature: null, encounter: raced };
      throw e;
    }
    const written = await this.getEncounter(encounter);
    if (!written) throw new Error(`transaction ${signature} confirmed but Encounter account not found`);
    return { signature, encounter: written };
  }
}
