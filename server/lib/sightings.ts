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
}) {
  const pairs = new Map<string, Promise<Confirmation>>();

  return async function process(observer: Peer, sightings: Sighting[], nowMs: number): Promise<Confirmed[]> {
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
        p = deps.confirm(observer, { identity: seen.identity, wallet: seen.wallet, tier: seen.tier }, nowMs);
        pairs.set(key, p);
        p.catch(() => pairs.delete(key));
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
