// Menu cache (ADR-0004): localStorage `{ v, ts, data }`, background revalidation, notes.
import { describe, expect, test, vi } from "vitest";
import type { MenuEntry } from "~/domain/menu";
import { menu, menuProduct } from "~/domain/testing/menu";
import { MENU_FRESH_MS, MENU_STORAGE_KEY, MENU_URL, type MenuStoreIo, createMenuStore } from "./menu-cache";

const CAKE = "11111111-1111-4111-8111-111111111111";
const TART = "22222222-2222-4222-8222-222222222222";

const entry = (v: string, generatedAt: number, cakeRs = 850, withTart = true): MenuEntry => ({
  v,
  data: menu([menuProduct(CAKE, cakeRs), ...(withTart ? [menuProduct(TART, 400)] : [])], generatedAt),
});

function memoryStorage(initial?: unknown) {
  const items = new Map<string, string>(initial ? [[MENU_STORAGE_KEY, JSON.stringify(initial)]] : []);
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), items };
}

function io(overrides: Partial<MenuStoreIo> & { storage?: MenuStoreIo["storage"] } = {}) {
  let clock = 1_000_000;
  const storage = memoryStorage();
  const base: MenuStoreIo & { tick(ms: number): void; mem: typeof storage } = {
    storage: () => storage,
    fetch: vi.fn(async () => Response.json(entry("v2", 2000, 900))) as unknown as typeof fetch,
    now: () => clock,
    tick: (ms) => (clock += ms),
    mem: storage,
  };
  return Object.assign(base, overrides);
}

describe("menu cache storage", () => {
  test("starts from the stored copy and persists { v, ts, data }", () => {
    const stored = { ...entry("v1", 1000), ts: 5 };
    const store = createMenuStore(io({ storage: () => memoryStorage(stored) }));
    expect(store.state().entry?.v).toBe("v1");

    const deps = io();
    const fresh = createMenuStore(deps);
    fresh.offer(entry("v1", 1000));
    expect(JSON.parse(deps.mem.items.get(MENU_STORAGE_KEY)!)).toMatchObject({ v: "v1", ts: 1_000_000, data: { generatedAt: 1000 } });
  });

  test("throwing or corrupt storage means no cache, never an error", () => {
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    const store = createMenuStore(io({ storage: () => throwing }));
    expect(store.state().entry).toBeNull();
    expect(() => store.offer(entry("v1", 1000))).not.toThrow();
    expect(store.state().entry?.v).toBe("v1");

    expect(createMenuStore(io({ storage: () => ({ getItem: () => "{oops", setItem: () => {} }) })).state().entry).toBeNull();
    expect(createMenuStore(io({ storage: () => null })).state().entry).toBeNull();
  });
});

describe("revalidation", () => {
  test("a fresh copy is not fetched again within a minute; afterwards it is", async () => {
    const deps = io();
    const store = createMenuStore(deps);
    store.offer(entry("v1", 1000));

    await store.revalidate();
    expect(deps.fetch).not.toHaveBeenCalled();

    deps.tick(MENU_FRESH_MS);
    await store.revalidate();
    expect(deps.fetch).toHaveBeenCalledWith(MENU_URL, expect.objectContaining({ cache: "default" }));
    expect(store.state().entry?.v).toBe("v2");
  });

  test("force asks the server (no-cache: the ETag gets a 304 when nothing changed)", async () => {
    const deps = io();
    const store = createMenuStore(deps);
    store.offer(entry("v1", 1000));
    await store.revalidate({ force: true });
    expect(deps.fetch).toHaveBeenCalledWith(MENU_URL, expect.objectContaining({ cache: "no-cache" }));
  });

  test("a changed price becomes a note and listeners hear it", async () => {
    const deps = io();
    const store = createMenuStore(deps);
    store.offer(entry("v1", 1000, 850));
    const listener = vi.fn();
    store.subscribe(listener);

    await store.revalidate({ force: true });

    expect(listener).toHaveBeenCalled();
    expect(store.state().notes.get(CAKE)).toEqual({ fromRs: 850, toRs: 900 });
  });

  test("an older copy (an HTTP-cached answer) never replaces a newer one", () => {
    const store = createMenuStore(io());
    store.offer(entry("v2", 2000, 900));
    store.offer(entry("v1", 1000, 850));
    expect(store.state().entry?.v).toBe("v2");
    expect(store.state().notes.size).toBe(0);
  });

  test("a product that leaves the menu keeps its name for the basket line", () => {
    const store = createMenuStore(io());
    store.offer(entry("v1", 1000));
    store.offer(entry("v2", 2000, 850, false));
    expect(store.state().goneNames.get(TART)).toEqual({ en: "P2", fr: null });
  });

  test("names the server found for hidden basket products are kept, so the header count can leave them out (UX audit M1)", () => {
    const store = createMenuStore(io());
    const listener = vi.fn();
    store.subscribe(listener);

    store.rememberGone({ [TART]: { en: "Old tart", fr: null } });
    store.rememberGone({ [TART]: { en: "Old tart", fr: null } });

    expect(store.state().goneNames.get(TART)).toEqual({ en: "Old tart", fr: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("offline or a bad answer keeps the copy", async () => {
    const failing = io({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    const store = createMenuStore(failing);
    store.offer(entry("v1", 1000));
    await expect(store.revalidate({ force: true })).resolves.toBeUndefined();
    expect(store.state().entry?.v).toBe("v1");

    const junk = io({ fetch: vi.fn(async () => Response.json({ nope: true })) as unknown as typeof fetch });
    const other = createMenuStore(junk);
    other.offer(entry("v1", 1000));
    await other.revalidate({ force: true });
    expect(other.state().entry?.v).toBe("v1");
  });

  test("replace takes a refusal's prices even at the same read time", () => {
    const store = createMenuStore(io());
    store.offer(entry("v1", 1000, 850));
    store.replace(entry("v1+refused", 1000, 950));
    expect(store.state().notes.get(CAKE)).toEqual({ fromRs: 850, toRs: 950 });
  });
});
