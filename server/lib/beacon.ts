import { createHmac } from "node:crypto";
import { address, getAddressEncoder } from "@solana/kit";
import type { Tier } from "./auth";

export const EPOCH_SECONDS = 300;

export type Peer = { identity: string; wallet: string; tier: Tier };
export type Beacon = { token: string; epoch: number; expiresAt: number };

export const epochOf = (nowMs: number) => Math.floor(nowMs / 1000 / EPOCH_SECONDS);

const addressEncoder = getAddressEncoder();

/** First 16 bytes of HMAC-SHA256(secret, identity(32) || epoch u64 BE), as 32 lowercase hex chars. */
export function beaconToken(secret: string, identity: string, epoch: number): string {
  const msg = Buffer.alloc(40);
  msg.set(addressEncoder.encode(address(identity)), 0);
  msg.writeBigUInt64BE(BigInt(epoch), 32);
  return createHmac("sha256", secret).update(msg).digest().subarray(0, 16).toString("hex");
}

/** token -> peer for the current and previous epoch. Tokens are one-way, so the map is the only way back. */
export class BeaconRegistry {
  private map = new Map<string, Peer & { epoch: number }>();

  constructor(private secret: string) {}

  issue(peer: Peer, nowMs: number): Beacon {
    const epoch = epochOf(nowMs);
    this.prune(epoch);
    const token = beaconToken(this.secret, peer.identity, epoch);
    this.map.set(token, { ...peer, epoch });
    return { token, epoch, expiresAt: (epoch + 1) * EPOCH_SECONDS };
  }

  /** Null for unknown tokens and tokens older than the previous epoch. */
  resolve(token: string, nowMs: number): (Peer & { epoch: number }) | null {
    const hit = this.map.get(token.toLowerCase());
    if (!hit || hit.epoch < epochOf(nowMs) - 1) return null;
    return hit;
  }

  private prune(epochNow: number) {
    for (const [t, p] of this.map) if (p.epoch < epochNow - 1) this.map.delete(t);
  }
}
