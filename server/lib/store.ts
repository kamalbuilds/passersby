import { epochOf } from "./beacon";

export const SIGHTING_TTL_MS = 15 * 60 * 1000;

/** Directed sightings (observer -> observed, per epoch) with expiry. */
export class SightingStore {
  private seen = new Map<string, Map<number, number>>();

  /**
   * Record that `observer` saw `observed`'s token from `epoch`.
   * True when the reverse direction exists in the same or an adjacent epoch.
   */
  observe(observer: string, observed: string, epoch: number, nowMs: number): boolean {
    this.prune(nowMs);
    const key = `${observer}>${observed}`;
    if (!this.seen.has(key) && this.seen.size >= 10_000) return false;
    const epochs = this.seen.get(key) ?? new Map<number, number>();
    epochs.set(epoch, nowMs);
    this.seen.set(key, epochs);
    const reverse = this.seen.get(`${observed}>${observer}`);
    if (!reverse) return false;
    return [epoch - 1, epoch, epoch + 1].some((e) => reverse.has(e));
  }

  private prune(nowMs: number) {
    for (const [k, epochs] of this.seen) {
      for (const [e, at] of epochs) if (nowMs - at > SIGHTING_TTL_MS) epochs.delete(e);
      if (epochs.size === 0) this.seen.delete(k);
    }
  }
}

export const dayOf = (nowMs: number) => Math.floor(nowMs / 1000 / 86_400);
export { epochOf };
