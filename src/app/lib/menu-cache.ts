// The menu cached in the phone (ADR-0004): localStorage `apb_menu` = `{ v, ts, data }`
// (v = ETag, ts = when this browser last stored or confirmed it, data = the public menu).
// The basket and checkout render from it at once and it is revalidated in the background
// against GET /api/menu. When a newer copy changes a price, a note is kept for that product
// ("Price updated from Rs X to Rs Y"). Every storage access is in try/catch: private mode,
// a full quota or blocked storage just means no cache.
import { useSyncExternalStore } from "react";
import { type LocalizedName } from "~/domain/pricing";
import { type MenuEntry, type PriceNote, isMenuEntry, mergePriceNotes, priceChanges } from "~/domain/menu";

export const MENU_STORAGE_KEY = "apb_menu";
export const MENU_URL = "/api/menu";
/** Background revalidation at most this often (the endpoint's max-age). */
export const MENU_FRESH_MS = 60_000;

export interface MenuState {
  entry: MenuEntry | null;
  /** Price changes seen in this page session, by product id. */
  notes: ReadonlyMap<string, PriceNote>;
  /** Names of products that left the menu (sold out lines keep theirs in the menu). */
  goneNames: ReadonlyMap<string, LocalizedName>;
}

export interface MenuStoreIo {
  storage: () => Pick<Storage, "getItem" | "setItem"> | null;
  fetch: typeof fetch;
  now: () => number;
}

export interface MenuStore {
  subscribe(listener: () => void): () => void;
  state(): MenuState;
  /** Takes `entry` when it is newer than the current copy (server read time). */
  offer(entry: MenuEntry): void;
  /** Replaces the current copy whatever its age (prices from a placeOrder refusal). */
  replace(entry: MenuEntry): void;
  /** Fetches /api/menu unless fresh; `force` asks the server even within max-age (ETag answers 304). */
  revalidate(options?: { force?: boolean }): Promise<void>;
}

interface Stored {
  v: string;
  ts: number;
  data: MenuEntry["data"];
}

function load(io: MenuStoreIo): { entry: MenuEntry | null; ts: number } {
  try {
    const raw = io.storage()?.getItem(MENU_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const ts = (parsed as Partial<Stored> | null)?.ts;
    if (isMenuEntry(parsed) && typeof ts === "number") return { entry: { v: parsed.v, data: parsed.data }, ts };
  } catch {
    // unreadable or corrupt: no cache
  }
  return { entry: null, ts: 0 };
}

function persist(io: MenuStoreIo, entry: MenuEntry, ts: number) {
  try {
    io.storage()?.setItem(MENU_STORAGE_KEY, JSON.stringify({ v: entry.v, ts, data: entry.data } satisfies Stored));
  } catch {
    // quota or blocked storage: the in-memory copy still works for this page
  }
}

export function createMenuStore(io: MenuStoreIo): MenuStore {
  const listeners = new Set<() => void>();
  let initialised = false;
  let state: MenuState = { entry: null, notes: new Map(), goneNames: new Map() };
  let confirmedAt = 0;
  let inFlight: Promise<void> | null = null;

  const init = () => {
    if (initialised) return;
    initialised = true;
    const stored = load(io);
    state = { ...state, entry: stored.entry };
    confirmedAt = stored.ts;
  };
  const set = (next: MenuState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const take = (entry: MenuEntry) => {
    const current = state.entry;
    confirmedAt = io.now();
    persist(io, entry, confirmedAt);
    if (current?.v === entry.v) return;
    const changes = current ? priceChanges(current.data, entry.data) : new Map<string, PriceNote>();
    const kept = new Set(entry.data.products.map((p) => p.id));
    const goneNames = new Map(state.goneNames);
    for (const product of current?.data.products ?? []) if (!kept.has(product.id)) goneNames.set(product.id, product.name);
    set({ entry, notes: mergePriceNotes(state.notes, changes), goneNames });
  };

  const store: MenuStore = {
    subscribe(listener) {
      init();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state() {
      init();
      return state;
    },
    offer(entry) {
      init();
      const current = state.entry;
      if (current && entry.data.generatedAt <= current.data.generatedAt) {
        if (current.v === entry.v) {
          confirmedAt = io.now();
          persist(io, current, confirmedAt);
        }
        return;
      }
      take(entry);
    },
    replace(entry) {
      init();
      take(entry);
    },
    revalidate({ force = false } = {}) {
      init();
      if (!force && state.entry && io.now() - confirmedAt < MENU_FRESH_MS) return Promise.resolve();
      inFlight ??= (async () => {
        try {
          const response = await io.fetch(MENU_URL, { cache: force ? "no-cache" : "default", headers: { accept: "application/json" } });
          if (!response.ok) return;
          const body: unknown = await response.json();
          if (isMenuEntry(body)) store.offer(body);
        } catch {
          // offline or a bad answer: keep the copy we have
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
  return store;
}

const browserStorage = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** The page's menu cache. */
export const menuStore = createMenuStore({
  storage: browserStorage,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
});

const EMPTY: MenuState = { entry: null, notes: new Map(), goneNames: new Map() };

/** The cached menu state (empty on the server and during hydration). */
export function useMenuState(): MenuState {
  return useSyncExternalStore(menuStore.subscribe, menuStore.state, () => EMPTY);
}
