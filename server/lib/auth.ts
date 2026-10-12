import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getBase58Encoder,
  getPublicKeyFromAddress,
  verifySignature,
  type Address,
  type SignatureBytes,
} from "@solana/kit";

export const SIGN_IN_WINDOW_SECONDS = 300;
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

export type Tier = "seeker" | "wallet";
export type Session = { wallet: string; identity: string; tier: Tier; exp: number };

const b58Bytes = getBase58Encoder();

export function signInMessage(wallet: string, issued: number): string {
  return `passersby sign-in\nwallet: ${wallet}\nissued: ${issued}`;
}

/** Returns an error string, or null when the sign-in message is well formed and fresh. */
export function checkSignInMessage(message: string, wallet: string, nowSeconds: number): string | null {
  const m = /^passersby sign-in\nwallet: ([1-9A-HJ-NP-Za-km-z]+)\nissued: (\d{1,12})$/.exec(message);
  if (!m) return "malformed_message";
  if (m[1] !== wallet) return "wallet_mismatch";
  const issued = Number(m[2]);
  if (message !== signInMessage(wallet, issued)) return "malformed_message";
  if (Math.abs(nowSeconds - issued) > SIGN_IN_WINDOW_SECONDS) return "message_expired";
  return null;
}

export async function verifyWalletSignature(wallet: Address, message: string, signatureB58: string): Promise<boolean> {
  const sig = b58Bytes.encode(signatureB58);
  if (sig.length !== 64) return false;
  const key = await getPublicKeyFromAddress(wallet);
  return verifySignature(key, sig as SignatureBytes, new TextEncoder().encode(message));
}

const mac = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest();

/** base64url(wallet|identity|tier|exp) "." base64url(HMAC-SHA256) */
export function issueSession(secret: string, s: Session): string {
  const payload = `${s.wallet}|${s.identity}|${s.tier}|${s.exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${mac(secret, payload).toString("base64url")}`;
}

export function readSession(secret: string, token: string, nowSeconds: number): Session | null {
  const [p, m, extra] = token.split(".");
  if (!p || !m || extra !== undefined) return null;
  const payload = Buffer.from(p, "base64url").toString("utf8");
  const given = Buffer.from(m, "base64url");
  const want = mac(secret, payload);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const parts = payload.split("|");
  if (parts.length !== 4) return null;
  const [wallet, identity, tier, exp] = parts;
  if (tier !== "seeker" && tier !== "wallet") return null;
  const expN = Number(exp);
  if (!Number.isInteger(expN) || expN <= nowSeconds) return null;
  return { wallet, identity, tier, exp: expN };
}
