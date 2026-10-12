import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { address, isAddress } from "@solana/kit";
import {
  checkSignInMessage,
  issueSession,
  readSession,
  SESSION_TTL_SECONDS,
  verifyWalletSignature,
  type Session,
} from "./lib/auth";
import { BeaconRegistry } from "./lib/beacon";
import { Chain, DEFAULT_DEVNET_RPC, DEFAULT_PROGRAM_ID } from "./lib/chain";
import { createSightingProcessor, type Sighting } from "./lib/sightings";
import { DEFAULT_RPC, lookupSgt } from "./lib/sgt";
import { SightingStore } from "./lib/store";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const tokenSecret = need("TOKEN_SECRET");
if (tokenSecret.length < 16) throw new Error("TOKEN_SECRET must be at least 16 characters");
const mainnetRpc = process.env.MAINNET_RPC_URL || DEFAULT_RPC;

const registry = new BeaconRegistry(tokenSecret);
let chain: Chain;
let processSightings: ReturnType<typeof createSightingProcessor>;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 65_536) throw new HttpError(413, "payload_too_large");
  }
  try {
    const v = raw ? JSON.parse(raw) : {};
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "bad_json");
  }
}

function sessionOf(req: IncomingMessage): Session {
  const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "");
  const s = m && readSession(tokenSecret, m[1], Math.floor(Date.now() / 1000));
  if (!s) throw new HttpError(401, "unauthorized");
  return s;
}

const peerOf = (s: Session) => ({ identity: s.identity, wallet: s.wallet, tier: s.tier });

async function postSession(req: IncomingMessage) {
  const { wallet, message, signature } = await readJson(req);
  if (typeof wallet !== "string" || !isAddress(wallet) || typeof message !== "string" || typeof signature !== "string") {
    throw new HttpError(400, "bad_request");
  }
  const now = Math.floor(Date.now() / 1000);
  const msgErr = checkSignInMessage(message, wallet, now);
  if (msgErr) throw new HttpError(400, msgErr);
  let valid = false;
  try {
    valid = await verifyWalletSignature(address(wallet), message, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new HttpError(401, "bad_signature");

  let lookup;
  try {
    lookup = await lookupSgt(address(wallet), mainnetRpc);
  } catch (e) {
    console.error("sgt lookup:", (e as Error).message);
    throw new HttpError(502, "rpc_unavailable");
  }
  const tier = lookup.found ? "seeker" : "wallet";
  const identity = lookup.found ? lookup.sgtMint : wallet;
  const session: Session = { wallet, identity, tier, exp: now + SESSION_TTL_SECONDS };
  return { sessionToken: issueSession(tokenSecret, session), identity, tier };
}

async function postSightings(req: IncomingMessage) {
  const s = sessionOf(req);
  const { sightings } = await readJson(req);
  if (!Array.isArray(sightings) || sightings.length > 200) throw new HttpError(400, "bad_request");
  const clean: Sighting[] = [];
  for (const x of sightings) {
    if (typeof x?.token !== "string" || !/^[0-9a-fA-F]{32}$/.test(x.token)) throw new HttpError(400, "bad_token");
    clean.push({ token: x.token, rssi: Number(x.rssi), at: Number(x.at) });
  }
  return { confirmed: await processSightings(peerOf(s), clean, Date.now()) };
}

async function getEncounters(url: URL) {
  const identity = url.searchParams.get("identity");
  if (!identity || !isAddress(identity)) throw new HttpError(400, "bad_identity");
  const id = address(identity);
  const [encounters, profile] = await Promise.all([chain.getEncounters(id), chain.getProfile(id)]);
  return { encounters, profile };
}

async function main() {
  chain = await Chain.create({
    rpcUrl: process.env.DEVNET_RPC_URL || DEFAULT_DEVNET_RPC,
    programId: process.env.PROGRAM_ID || DEFAULT_PROGRAM_ID,
    attestorSecretB58: need("ATTESTOR_SECRET_KEY"),
    relayerSecretB58: need("RELAYER_SECRET_KEY"),
  });
  processSightings = createSightingProcessor({
    registry,
    store: new SightingStore(),
    confirm: (a, b, nowMs) => chain.confirmEncounter(a, b, nowMs),
    onError: (e) => console.error("confirm failed:", (e as Error).message),
  });
  createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type, authorization");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const route = `${req.method} ${url.pathname}`;
      switch (route) {
        case "GET /health":
          return send(res, 200, { ok: true, cluster: "devnet", program: chain.programId, attestor: chain.attestor });
        case "POST /session":
          return send(res, 200, await postSession(req));
        case "GET /beacon":
          return send(res, 200, registry.issue(peerOf(sessionOf(req)), Date.now()));
        case "POST /sightings":
          return send(res, 200, await postSightings(req));
        case "GET /encounters":
          return send(res, 200, await getEncounters(url));
        default:
          throw new HttpError(404, "not_found");
      }
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code });
      console.error("unhandled:", (e as Error).message);
      return send(res, 500, { error: "internal" });
    }
  }).listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
