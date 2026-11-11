// The public menu (ADR-0004) as GET /api/menu and the basket loader serve it: products that
// are not hidden (names, photos, options, prices, availability) and the checkout Settings a
// customer sees anyway (fee, windows, pickup address, Juice number, policies). Public data
// only: no admin fields, no hidden products, no order or customer data (threat-model D13).
import { todayMU } from "~/domain/time";
import type { Menu, MenuEntry } from "~/domain/menu";
import { publicImageUrl } from "~/lib/images";
import type { Database } from "~/server/db.server";
import { listMenuProducts } from "~/server/repos/catalogue.server";
import { getSiteSettings } from "~/server/repos/settings.server";

/** The ETag: a hash of everything but the read time, so an unchanged menu answers 304. */
export async function menuVersion(menu: Omit<Menu, "generatedAt">): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([menu.products, menu.checkout, menu.today]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `m-${Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export interface MenuSources {
  db: Database;
  supabaseUrl: string;
  /** The request clock (Mauritius date for the checkout). */
  now: Date;
}

export async function loadMenu({ db, supabaseUrl, now }: MenuSources): Promise<MenuEntry> {
  // Display only: Settings come from the isolate cache (60 s); placeOrder reads them fresh.
  const [records, settings] = await Promise.all([listMenuProducts(db), getSiteSettings(db)]);
  const { orderNumberPrefix: _private, ...checkout } = settings.checkout;
  const products = records.map((r) => ({
    id: r.id,
    slug: r.slug,
    type: r.type,
    name: r.name,
    basePriceRs: r.basePriceRs,
    status: r.status,
    minQuantity: r.minQuantity,
    photos: r.photos.map((p) => ({ url: publicImageUrl(p.storagePath, supabaseUrl), width: p.width, height: p.height })),
    optionGroups: r.optionGroups,
  }));
  const body = { products, checkout, today: todayMU(now) };
  // Real time, not the (test) request clock: it only orders copies of the menu.
  return { v: await menuVersion(body), data: { ...body, generatedAt: Date.now() } };
}
