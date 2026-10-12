import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dayOf, SightingStore } from "./store";
import type { BeaconRegistry, Peer } from "./beacon";
import type { Confirmation } from "./chain";

export type Sighting = { token: string; rssi: number; at: number };
export type Confirmed = Confirmation & { other: Peer };
export type Confirm = (a: Peer, b: Peer, nowMs: number) => Promise<Confirmation>;

const pairKey = (a: string, b: string, nowMs: number) => `${[a, b].sort().join("|")}|${dayOf(nowMs)}`;

/**
 * Resolves tokens, stores directed sightings and calls `confirm` once per pair per day
 * when both directions have been seen. Repeat batches for a confirmed pair return the same result.
 */
export function createSightingProcessor(deps: {
  registry: BeaconRegistry;
  store: SightingStore;
  confirm: Confirm;
  onError?: (e: unknown) => void;
  budgetPath?: string;
}) {
  const pairs = new Map<string, Promise<Confirmation>>();
  let budgetDay = -1;
  let attempts = 0;
  if (deps.budgetPath && existsSync(deps.budgetPath)) {
    const saved = JSON.parse(readFileSync(deps.budgetPath, "utf8"));
    if (!Number.isSafeInteger(saved.day) || saved.day < 0 ||
        !Number.isSafeInteger(saved.attempts) || saved.attempts < 0 || saved.attempts > 100) {
      throw new Error("invalid relay budget");
    }
    budgetDay = saved.day;
    attempts = saved.attempts;
  }

  return async function process(observer: Peer, sightings: Sighting[], nowMs: number): Promise<Confirmed[]> {
    const day = dayOf(nowMs);
    if (day > budgetDay) {
      pairs.clear();
      budgetDay = day;
      attempts = 0;
    }
    const out: Confirmed[] = [];
    const done = new Set<string>();
    for (const s of sightings) {
      const seen = deps.registry.resolve(s.token, nowMs);
      if (!seen || seen.identity === observer.identity || seen.wallet === observer.wallet) continue;
      const mutual = deps.store.observe(observer.identity, seen.identity, seen.epoch, nowMs);
      if (!mutual) continue;
      const key = pairKey(observer.identity, seen.identity, nowMs);
      if (done.has(key)) continue;
      done.add(key);
      let p = pairs.get(key);
      if (!p) {
        if (day !== budgetDay || attempts >= 100) continue;
        // shortcut: one relayer process per budget file, use a shared atomic budget before scaling.
        attempts++;
        if (deps.budgetPath) {
          writeFileSync(`${deps.budgetPath}.tmp`, JSON.stringify({ day: budgetDay, attempts }), { mode: 0o600 });
          renameSync(`${deps.budgetPath}.tmp`, deps.budgetPath);
        }
        p = Promise.resolve().then(() => deps.confirm(observer, { identity: seen.identity, wallet: seen.wallet, tier: seen.tier }, nowMs));
        pairs.set(key, p);
        const pending = p;
        p.catch(() => { if (pairs.get(key) === pending) pairs.delete(key); });
      }
      try {
        const c = await p;
        out.push({ ...c, other: { identity: seen.identity, wallet: seen.wallet, tier: seen.tier } });
      } catch (e) {
        deps.onError?.(e);
      }
    }
    return out;
  };
}
