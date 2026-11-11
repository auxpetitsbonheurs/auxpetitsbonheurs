// Per-isolate cache for the Settings row (staging latency fix): each customer page read it,
// one database round trip each. Only settled values are kept: a Worker must not await a
// promise started by another request, so concurrent misses each load for themselves.

/** Admin edits show on the site within this long; money paths (placeOrder) never use the cache. */
export const SETTINGS_TTL_MS = 60_000;

export interface TtlCache<T> {
  get(load: () => Promise<T>): Promise<T>;
  clear(): void;
}

export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  let entry: { value: T; expiresAt: number } | undefined;
  return {
    async get(load) {
      if (entry && now() < entry.expiresAt) return entry.value;
      const value = await load();
      entry = { value, expiresAt: now() + ttlMs };
      return value;
    },
    clear() {
      entry = undefined;
    },
  };
}
