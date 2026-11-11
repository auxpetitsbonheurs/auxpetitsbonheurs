// Browser basket (ADR-0004): add, change quantity and remove happen here with no network
// call, writing the same `apb_basket` cookie the server reads (format and caps in
// app/domain/basket-cookie.ts). Components subscribe through useSyncExternalStore; the server
// snapshot is what the loader read from the request, so hydration matches the HTML.
import { useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { type BasketLine, type NewBasketLine, addLine, removeLine, restoreLine, setLineQuantity } from "~/domain/basket";
import { orderableItemCount } from "~/domain/menu";
import { menuStore } from "./menu-cache";
import { basketCookie, basketCookieValue, decodeBasket, newLineId } from "~/domain/basket-cookie";

export interface CookieJar {
  read(): string;
  write(cookie: string): void;
}

export interface BasketStore {
  subscribe(listener: () => void): () => void;
  /** Current lines (same array while the cookie is unchanged). */
  lines(): BasketLine[];
  /** Adds a line (merging an identical configuration). Throws DomainError BASKET_FULL. */
  add(line: NewBasketLine): BasketLine[];
  setQuantity(lineId: string, quantity: number): BasketLine[];
  remove(lineId: string): BasketLine[];
  /** Undo of a Remove: the same line back at `index` (UX audit M3). */
  restore(line: BasketLine, index: number): BasketLine[];
  /** False when the cookie cannot be written from script (an old HttpOnly cookie, cookies off). */
  writable(): boolean;
  /** Re-reads the cookie (another tab, a server response) and notifies when it changed. */
  refresh(): void;
}

export function createBasketStore(jar: CookieJar, lineId: () => string = newLineId): BasketStore {
  const listeners = new Set<() => void>();
  let raw: string | undefined;
  let cached: BasketLine[] = [];
  const read = () => {
    const value = basketCookieValue(jar.read());
    if (value !== raw) {
      raw = value;
      cached = decodeBasket(value);
    }
    return cached;
  };
  const notify = () => listeners.forEach((listener) => listener());
  const save = (lines: BasketLine[]) => {
    const cookie = basketCookie(lines); // throws BASKET_FULL before anything is written
    jar.write(cookie);
    const stored = read();
    // Read back: a script cannot replace an old HttpOnly cookie (or cookies are off).
    if ((basketCookieValue(cookie) ?? "") !== (raw ?? "") && lines.length > 0) throw new Error("basket cookie not writable");
    notify();
    return stored;
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lines: read,
    add: (line) => save(addLine(read(), line, lineId)),
    setQuantity: (id, quantity) => save(setLineQuantity(read(), id, quantity)),
    remove: (id) => save(removeLine(read(), id)),
    restore(line, index) {
      const current = read();
      const next = restoreLine(current, line, index);
      return next === current ? current : save(next);
    },
    writable() {
      try {
        return basketCookieValue(jar.read()) !== undefined || probe(jar);
      } catch {
        return false;
      }
    },
    refresh() {
      const before = raw;
      read();
      if (raw !== before) notify();
    },
  };
}

/** True when a cookie written from script can be read back (cookies enabled). */
function probe(jar: CookieJar): boolean {
  jar.write("apb_probe=1; Path=/; SameSite=Lax; Secure");
  const ok = jar.read().includes("apb_probe=1");
  jar.write("apb_probe=; Max-Age=0; Path=/; SameSite=Lax; Secure");
  return ok;
}

const documentJar: CookieJar = {
  read: () => (typeof document === "undefined" ? "" : document.cookie),
  write: (cookie) => {
    if (typeof document !== "undefined") document.cookie = cookie;
  },
};

/** The page's basket. */
export const basketStore = createBasketStore(documentJar);

if (typeof window !== "undefined") {
  // Another tab may have changed the basket.
  window.addEventListener("focus", () => basketStore.refresh());
  document.addEventListener("visibilitychange", () => basketStore.refresh());
}

/** The basket lines: the loader's before hydration, the cookie's after. */
export function useBasketLines(serverLines: BasketLine[]): BasketLine[] {
  // A navigation may bring a server Set-Cookie (order placed, no-JS fallback): re-read then.
  useLocation();
  return useSyncExternalStore(basketStore.subscribe, basketStore.lines, () => serverLines);
}

/** Re-renders on a basket change or a menu change (a line may turn sold out). */
function subscribeBasketAndMenu(listener: () => void) {
  const offBasket = basketStore.subscribe(listener);
  const offMenu = menuStore.subscribe(listener);
  return () => {
    offBasket();
    offMenu();
  };
}

/** Items that will be ordered, for the header count (UX audit M1: known sold-out or gone lines are not counted). */
function orderableCount(): number {
  const { entry, goneNames } = menuStore.state();
  return orderableItemCount(basketStore.lines(), entry?.data ?? null, new Set(goneNames.keys()));
}

/** Items in the basket for the header count. */
export function useBasketCount(serverCount: number): number {
  useLocation();
  return useSyncExternalStore(subscribeBasketAndMenu, orderableCount, () => serverCount);
}
