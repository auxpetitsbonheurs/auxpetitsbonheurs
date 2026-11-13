// The promo banner (S-062, FR-002): the live banner promotion for this request, unless the
// visitor dismissed it in this browser session. Liveness is judged per request from the
// current promotions and the request clock (no job): it appears on its start instant and is
// gone from the first page loaded at its end (end exclusive, Mauritius time).
//
// Dismissed ids live in the session cookie `apb_banner_dismissed` (HttpOnly, SameSite=Lax, no
// Max-Age, so a new browser session shows the banner again), at most 10 ids, uuids only.
import { liveBanner } from "~/domain/promotions";
import { readCookie } from "~/lib/cookies";
import type { SitePromotion } from "~/server/repos/promotions.server";

export const BANNER_COOKIE = "apb_banner_dismissed";
export const BANNER_COOKIE_MAX_IDS = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The banner as the site layout renders it (contracts.md, site layout `banner`). */
export interface SiteBanner {
  id: string;
  title: { en: string; fr: string | null };
  text: { en: string; fr: string | null } | null;
  /** Unprefixed site path, or null for text only (none, or a hidden or deleted product). */
  href: string | null;
  /** The end instant (ISO): the page hides the banner then, even without a reload. */
  endsAt: string;
}

/** The ids this visitor dismissed in this session (malformed entries ignored). */
export function dismissedBanners(request: Request): string[] {
  const raw = readCookie(request, BANNER_COOKIE) ?? "";
  return raw.split(".").filter((id) => UUID.test(id)).slice(-BANNER_COOKIE_MAX_IDS);
}

/** The session cookie with `id` added (deduplicated, the 10 most recent). */
export function dismissCookie(request: Request, id: string): string {
  const ids = [...dismissedBanners(request).filter((d) => d !== id), id].slice(-BANNER_COOKIE_MAX_IDS);
  return `${BANNER_COOKIE}=${ids.join(".")}; Path=/; HttpOnly; SameSite=Lax; Secure`;
}

/** Where a promotion links (S-062 AC1, AC5): product, category section, custom order, or none. */
export function promotionHref(promotion: Pick<SitePromotion, "linkKind" | "linkCategory" | "linkProduct">): string | null {
  switch (promotion.linkKind) {
    case "custom_request":
      return "/custom-cake";
    case "product":
      return promotion.linkProduct && promotion.linkProduct.status !== "hidden" ? `/menu/${encodeURIComponent(promotion.linkProduct.slug)}` : null;
    case "category":
      return promotion.linkCategory ? `/menu#type-${promotion.linkCategory}` : null;
    default:
      return null;
  }
}

/** The banner to show now, or null (none live, card-only, or dismissed in this session). */
export function siteBanner(promotions: readonly SitePromotion[], now: Date, dismissed: readonly string[]): SiteBanner | null {
  const promo = liveBanner(promotions, now);
  if (!promo || dismissed.includes(promo.id)) return null;
  return { id: promo.id, title: promo.title, text: promo.text, href: promotionHref(promo), endsAt: promo.endsAt.toISOString() };
}
