// S-062 (promo banner): the customer frame's `banner`, judged per request with a fixed clock,
// and POST /api/banner/dismiss (the session cookie). Browser behaviour (Dismiss with and
// without JavaScript, 320 px, zoom, keyboard, axe): src/tests/e2e/promo-banner.spec.ts.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertPromotion } from "~/db/testing/promotions";
import { BANNER_COOKIE } from "~/server/banner.server";
import { promotionsCache } from "~/server/repos/promotions.server";
import { cookieFrom, routeArgs } from "~/server/testing/route-context";
import { action as dismiss, safeReturnPath } from "../hooks/banner-dismiss";
import { loader } from "./layout";

let database: TestDatabase;
beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);
afterEach(async () => {
  await database.close();
});

const page = (now: string, cookie?: string) => loader(routeArgs(database, { path: "/", now, cookie }) as never);
const INSIDE = "2026-11-12T08:00:00.000Z";
/** 12 Nov 09:00 to 18:00 Mauritius. */
const DAY = { starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z" };

describe("the banner (S-062 AC1, AC5)", () => {
  test("a live banner promotion shows its title, text and product link", async () => {
    const productId = await insertProduct(database.db, { slug: "lemon-tart" });
    const id = await insertPromotion(database, { ...DAY, title: "Easter offer", placement: "banner", linkKind: "product", linkProductId: productId });

    expect((await page(INSIDE)).banner).toEqual({
      id,
      title: { en: "Easter offer", fr: "Easter offer (fr)" },
      text: { en: "Ten percent off", fr: null },
      href: "/menu/lemon-tart",
      endsAt: "2026-11-12T14:00:00.000Z",
    });
  });

  test.each([
    [{ linkKind: "category" as const, linkCategory: "cupcake_box" }, "/menu#type-cupcake_box"],
    [{ linkKind: "custom_request" as const }, "/custom-cake"],
    [{ linkKind: "none" as const }, null],
  ])("links %o to %s", async (link, href) => {
    await insertPromotion(database, { ...DAY, placement: "both", ...link });
    expect((await page(INSIDE)).banner?.href).toBe(href);
  });

  test("AC5: a link to a hidden product is text only", async () => {
    const productId = await insertProduct(database.db, { slug: "secret", status: "hidden" });
    await insertPromotion(database, { ...DAY, placement: "banner", linkKind: "product", linkProductId: productId });
    expect((await page(INSIDE)).banner?.href).toBeNull();
  });

  test("card-only, inactive and not yet started promotions show no banner (AC6)", async () => {
    await insertPromotion(database, { ...DAY, placement: "card" });
    await insertPromotion(database, { ...DAY, placement: "banner", active: false });
    await insertPromotion(database, { starts: "2026-11-13T05:00:00Z", ends: "2026-11-13T14:00:00Z", placement: "banner" });
    expect((await page(INSIDE)).banner).toBeNull();
  });
});

describe("the banner ends on time with no job (S-062 AC4, fixed clock)", () => {
  test("ends 18:00 Mauritius: shown at 17:59:59, gone at 18:00:00", async () => {
    await insertPromotion(database, { ...DAY, placement: "banner" });

    expect((await page("2026-11-12T13:59:59.000Z")).banner).not.toBeNull();
    expect((await page("2026-11-12T14:00:00.000Z")).banner).toBeNull();
  });
});

describe("dismiss (S-062 AC3, AC7)", () => {
  const post = (form: Record<string, string>, cookie?: string) => dismiss(routeArgs(database, { path: "/api/banner/dismiss", form, cookie }) as never) as Promise<Response>;

  test("sets the session cookie (no Max-Age) and the banner is gone on the next page; a different promotion still shows", async () => {
    const first = await insertPromotion(database, { ...DAY, placement: "banner" });
    const response = await post({ promotionId: first, next: "/menu?x=1" });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/menu?x=1");
    const set = response.headers.get("set-cookie")!;
    expect(set).toMatch(new RegExp(`^${BANNER_COOKIE}=${first}; Path=/; HttpOnly; SameSite=Lax; Secure$`));
    expect(set).not.toMatch(/Max-Age|Expires/i);
    const cookie = cookieFrom(set);
    expect((await page(INSIDE, cookie)).banner).toBeNull();

    const later = await insertPromotion(database, { starts: "2026-11-12T07:00:00Z", ends: DAY.ends, placement: "banner" });
    promotionsCache.clear(); // as a new isolate (or a minute later) would read it
    expect((await page(INSIDE, cookie)).banner?.id).toBe(later);
  });

  test("with JavaScript (respond=inline) it answers { ok: true } and sets the same cookie", async () => {
    const id = await insertPromotion(database, { ...DAY, placement: "banner" });
    const response = await post({ promotionId: id, respond: "inline" });

    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain(`${BANNER_COOKIE}=${id}`);
  });

  test("AC7: a forged non-uuid id is VALIDATION_FAILED and the cookie is unchanged", async () => {
    const response = await post({ promotionId: "1' or 1=1--", respond: "inline" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("AC7: the cookie keeps at most the 10 most recent ids, uuids only", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const cookie = `${BANNER_COOKIE}=${ids.slice(0, 10).join(".")}.not-a-uuid`;
    const response = await post({ promotionId: ids[10]!, respond: "inline" }, cookie);

    const value = response.headers.get("set-cookie")!.split(";")[0]!.split("=")[1]!.split(".");
    expect(value).toEqual(ids.slice(1));
  });

  test("a return path that is not this site goes home", () => {
    expect(safeReturnPath("https://evil.example/")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath("/\t/evil.example")).toBe("/");
    expect(safeReturnPath("/\n/evil.example")).toBe("/");
    expect(safeReturnPath("/fr/menu")).toBe("/fr/menu");
    expect(safeReturnPath("/menu?type=cake")).toBe("/menu?type=cake");
  });
});
