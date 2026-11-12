// S-033: the admin frame's data (`admin/layout` loader, contracts.md), the More list,
// the header (page title and role as text) and the "Not available yet" destinations.
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AdminHeader } from "~/components/admin/admin-header";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import { signedInAdmin } from "~/server/testing/admin-session";
import { routeArgs } from "~/server/testing/route-context";
import * as calendar from "./calendar";
import * as customers from "./customers";
import * as gallery from "./gallery";
import { clientLoader as layoutClientLoader, loader as layoutLoader } from "./layout";
import { loader as moreLoader } from "./more";
import * as sales from "./sales";

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

    expect(data).toEqual({ me: { id: expect.any(String), name: "Sarah", role: "owner", locale: "en" }, nav: { ownerItems: true }, vapidPublicKey: null });
  });

  test("AC4: an Admin gets nav.ownerItems false", async () => {
    const args = await as("admin");

    expect(await layoutLoader(args("/admin"))).toMatchObject({ me: { role: "admin" }, nav: { ownerItems: false } });
  });
});

describe("More (AC3, AC4)", () => {
  const everyone = [
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

    expect(data.items.map((i) => i.label)).toEqual(["Galerie", "Clients", "Résumé des ventes", "Mon profil"]);
    expect(data.title).toBe("Plus");
  });
});

describe("destinations not built yet (AC7)", () => {
  test.each([
    ["calendar", calendar, "Calendar"],
    ["customers", customers, "Customers"],
    ["sales", sales, "Sales summary"],
    ["gallery", gallery, "Gallery"],
  ] as const)("/admin/%s loads its placeholder for an Admin, with its title", async (name, module, title) => {
    const args = await as("admin");

    expect(await module.loader(args(`/admin/${name}`))).toEqual({ title });
  });

  test("a placeholder renders Not available yet with a way back, not an error", async () => {
    const props = { loaderData: { title: "Calendar" } } as unknown as Parameters<typeof calendar.default>[0];
    const html = render(<calendar.default {...props} />);

    expect(html).toContain("<h1");
    expect(html).toContain("Calendar");
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
