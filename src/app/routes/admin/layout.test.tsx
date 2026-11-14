// S-033: the admin frame's data (`admin/layout` loader, contracts.md), the More list,
// the header (page title and role as text) and the "Not available yet" destinations.
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AdminHeader } from "~/components/admin/admin-header";
import { AdminBottomBar, reviewDotLabel } from "~/components/admin/bottom-bar";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import * as gallery from "./gallery";
import * as layoutModule from "./layout";
import { clientLoader as layoutClientLoader, loader as layoutLoader } from "./layout";
import { loader as moreLoader } from "./more";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function as(role: "owner" | "admin", locale: "en" | "fr" = "en") {
  const session = await signedInAdmin(database, { role, locale, name: "Sarah" });
  return (path: string) => routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never;
}

describe("admin/layout loader", () => {
  test("AC3, AC6: an Owner gets me (with role), nav.ownerItems true and no push key yet", async () => {
    const args = await as("owner");

    const data = await layoutLoader(args("/admin"));

    expect(data).toEqual({
      me: { id: expect.any(String), name: "Sarah", role: "owner", locale: "en" },
      nav: { ownerItems: true },
      badges: { toReview: 0, reviewsToApprove: 0 },
      vapidPublicKey: null,
    });
  });

  test("AC4: an Admin gets nav.ownerItems false", async () => {
    const args = await as("admin");

    expect(await layoutLoader(args("/admin"))).toMatchObject({ me: { role: "admin" }, nav: { ownerItems: false } });
  });
});

describe("Orders badge (S-034)", () => {
  const setStatus = (status: string, token: string) => database.client.query("update orders set status = $1 where tracking_token = $2", [status, token]);
  /** An order on the approval path (placed before Juice payment, 2026-11-13). */
  const placePending = async () => {
    const order = await placeTestOrder(database);
    await setStatus("pending_approval", order.token);
    return order;
  };

  test("AC1: 3 orders in Pending approval or Quote needed give toReview 3; other statuses do not count", async () => {
    const placed = [];
    for (let i = 0; i < 4; i += 1) placed.push(await placePending());
    // An order awaiting its Juice payment (approved, not paid) is listed in Orders → Payment, not counted as to review.
    await setStatus("awaiting_payment", (await placePending()).token);
    await setStatus("quote_needed", placed[1]!.token);
    await setStatus("approved", placed[3]!.token);
    const args = await as("admin");

    expect((await layoutLoader(args("/admin"))).badges).toEqual({ toReview: 3, reviewsToApprove: 0 });
  });

  test("AC2: no orders to review gives 0, and the bar shows no dot and no extra text", async () => {
    const args = await as("admin");
    expect((await layoutLoader(args("/admin"))).badges).toEqual({ toReview: 0, reviewsToApprove: 0 });

    const html = render(<AdminBottomBar toReview={0} />);
    expect(html).not.toContain("data-review-dot");
    expect(html).not.toContain("to review");
  });

  test("AC3: after an order is approved the next load counts one fewer (default revalidation kept)", async () => {
    const first = await placePending();
    await placePending();
    const args = await as("owner");
    expect((await layoutLoader(args("/admin"))).badges.toReview).toBe(2);

    await setStatus("approved", first.token);

    expect((await layoutLoader(args("/admin/orders"))).badges.toReview).toBe(1);
    expect(Object.keys(layoutModule)).not.toContain("shouldRevalidate");
  });

  test("AC1: the dot shows the number and the link says 3 to review", () => {
    const html = render(<AdminBottomBar toReview={3} />);

    expect(html).toMatch(/data-review-dot=""[^>]*>3<\/span>/);
    expect(html).toContain(", 3 to review");
  });

  test("AC4: in French the accessible text reads 3 à valider", () => {
    expect(render(<AdminBottomBar toReview={3} />, "fr")).toContain(", 3 à valider");
  });

  test("AC5: 12 shows 9+ and still says 12 to review", () => {
    const html = render(<AdminBottomBar toReview={12} />);

    expect(html).toMatch(/data-review-dot=""[^>]*>9\+<\/span>/);
    expect(html).toContain(", 12 to review");
    expect(reviewDotLabel(9)).toBe("9");
    expect(reviewDotLabel(10)).toBe("9+");
  });
});

describe("More (AC3, AC4)", () => {
  const everyone = [
    // E-14 S-263: Reviews (Admins and Owners), first so the count is seen at once.
    { key: "reviews", href: "/admin/reviews", label: "Reviews" },
    { key: "pages", href: "/admin/pages", label: "Pages" },
    { key: "workshops", href: "/admin/workshops", label: "Workshops" },
    { key: "promotions", href: "/admin/promotions", label: "Promotions" },
    { key: "gallery", href: "/admin/gallery", label: "Gallery" },
    { key: "customers", href: "/admin/customers", label: "Customers" },
    { key: "sales", href: "/admin/sales", label: "Sales summary" },
    { key: "profile", href: "/admin/profile", label: "My profile" },
  ];

  test("an Owner sees everyone's items, then Availability, Settings and Team (Team at /admin/team)", async () => {
    const args = await as("owner");

    const data = await moreLoader(args("/admin/more"));

    expect(data.items).toEqual(everyone);
    expect(data.ownerItems).toEqual([
      { key: "availability", href: "/admin/availability", label: "Availability" },
      { key: "settings", href: "/admin/settings", label: "Settings" },
      { key: "team", href: "/admin/team", label: "Team" },
    ]);
  });

  test("an Admin sees no Owner items", async () => {
    const args = await as("admin");

    const data = await moreLoader(args("/admin/more"));

    expect(data.items).toEqual(everyone);
    expect(data.ownerItems).toEqual([]);
  });

  test("labels follow the admin's language", async () => {
    const args = await as("owner", "fr");

    const data = await moreLoader(args("/admin/more"));

    expect(data.items.map((i) => i.label)).toEqual(["Avis", "Pages", "Ateliers", "Promotions", "Galerie", "Clients", "Résumé des ventes", "Mon profil"]);
    expect(data.title).toBe("Plus");
  });
});

describe("destinations not built yet (AC7)", () => {
  test.each([
    ["gallery", gallery, "Gallery"],
  ] as const)("/admin/%s loads its placeholder for an Admin, with its title", async (name, module, title) => {
    const args = await as("admin");

    expect(await module.loader(args(`/admin/${name}`))).toEqual({ title });
  });

  test("a placeholder renders Not available yet with a way back, not an error", async () => {
    const props = { loaderData: { title: "Gallery" } } as unknown as Parameters<typeof gallery.default>[0];
    const html = render(<gallery.default {...props} />);

    expect(html).toContain("<h1");
    expect(html).toContain("Gallery");
    expect(html).toContain("Not available yet");
    expect(html).toContain('href="/admin"');
  });
});

function render(element: React.ReactElement, locale: "en" | "fr" = "en") {
  const Stub = createRoutesStub([{ path: "/admin", Component: () => element }]);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <Stub initialEntries={["/admin"]} />
    </I18nProvider>,
  );
}

describe("frame fallback when a navigation's data fails (S-041 AC3)", () => {
  const frame = { me: { id: "a", name: "Sarah", role: "owner" as const, locale: "en" as const }, nav: { ownerItems: true }, vapidPublicKey: null };
  const call = (serverLoader: () => Promise<unknown>) => layoutClientLoader({ serverLoader } as never);

  test("a network failure keeps the last frame, so the page's own error shows inside it", async () => {
    await call(async () => frame);

    expect(await call(() => Promise.reject(new TypeError("Failed to fetch")))).toEqual(frame);
  });

  test("a 5xx keeps the last frame too", async () => {
    await call(async () => frame);

    expect(await call(() => Promise.reject(new Response(null, { status: 503 })))).toEqual(frame);
  });

  test("a redirect (signed out) is never hidden", async () => {
    await call(async () => frame);
    const signIn = new Response(null, { status: 302, headers: { Location: "/admin/login" } });

    await expect(call(() => Promise.reject(signIn))).rejects.toBe(signIn);
  });
});

describe("header (AC6)", () => {
  test("shows the page title and the role as text", () => {
    const html = render(<AdminHeader me={{ name: "Sarah", role: "admin" }} title="Orders" />);

    expect(html).toContain("Orders");
    expect(html).toContain("Admin");
    expect(html).toContain("Sarah");
  });

  test("in French, the Owner role reads Propriétaire", () => {
    const html = render(<AdminHeader me={{ name: "Sarah", role: "owner" }} title="Commandes" />, "fr");

    expect(html).toContain("Commandes");
    expect(html).toContain("Propriétaire");
  });
});
