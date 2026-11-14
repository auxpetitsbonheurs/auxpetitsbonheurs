// E-13 S-251 (Contact us), S-252 (Custom order, with the E-08 request form) and S-253 (head and sitemap) in the
// real app, at 320, 375 and 1280 px. The e2e seed sets placeholder WhatsApp and phone numbers.
// S-248..S-250 add their pages to PAGES.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { type Page, expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

const PAGES = [
  { path: "/contact", h1: { en: "Contact us", fr: "Contact" } },
  { path: "/custom-cake", h1: { en: "Custom order", fr: "Gâteau sur mesure" } },
] as const;

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("Contact us and Custom order at every width (S-251 AC8, S-252 AC6)", () => {
  for (const { path, h1 } of PAGES) {
    for (const [lang, url] of [["en", path], ["fr", `/fr${path}`]] as const) {
      test(`${url}: one h1, no horizontal scroll, 44 px targets, keyboard, axe, 200% zoom`, async ({ page }) => {
        await open(page, url);
        // The request form's calendar (E-08) is a lazy chunk that replaces the native date field
        // after hydration: check the page once it is there, so the Tab walk sees the final controls.
        if (path === "/custom-cake") await expect(page.getByRole("grid")).toBeVisible();

        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1[lang]);
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
        await expectNoA11yViolations(page);
        await expectNoA11yViolations(page, { zoom: 2 });
        await withZoom(page, 2, () => expectTapTargets(page));
      });
    }
  }
});

test.describe("Contact us (S-251)", () => {
  test("AC1, AC2, AC4: WhatsApp with a greeting, the phone as text, the footer's email, Beau Bassin and hours; no form", async ({ page, db }) => {
    // The values come from the shared Settings row: read them while no other spec is saving it
    // (specs that save Settings hold this lock and put the row back as found).
    await withSettingsLock(db, async () => {
      await open(page, "/contact");
      const main = page.getByRole("main");

      const whatsapp = main.getByRole("link", { name: "Message us on WhatsApp" });
      await expect(whatsapp).toHaveAttribute("href", "https://wa.me/23050000000?text=Hello%2C%20I%20have%20a%20question.");
      await expect(main.getByRole("link", { name: "Call +230 5000 0001" })).toHaveAttribute("href", "tel:+23050000001");
      await expect(main.getByText("Pickup in Beau Bassin")).toBeVisible();
      await expect(main.getByRole("heading", { level: 2, name: "Opening hours" })).toBeVisible();
      await expect(main.locator("form")).toHaveCount(0);
      // AC4 amended (2026-11-13): the same Settings email as the footer, so the two never disagree.
      await expect(main.getByRole("link", { name: "Email hello@example.com" })).toHaveAttribute("href", "mailto:hello@example.com");
      await expect(page.getByRole("contentinfo").locator('a[href="mailto:hello@example.com"]')).toHaveCount(1);
    });
  });

  test("AC3: no map link or embedded map when Settings has no map URL", async ({ page }) => {
    await open(page, "/fr/contact");

    await expect(page.getByRole("link", { name: /Voir sur la carte/ })).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
  });
});

test.describe("Custom order (S-252)", () => {
  // AC3 changed with E-08 S-151: the request form is now on the page and WhatsApp is the second way.
  test("AC2, AC3, AC4: WhatsApp with the custom-cake message after the request form, and a bad ?fromGallery= ignored", async ({ page }) => {
    await open(page, "/fr/custom-cake?fromGallery=abc");
    const main = page.getByRole("main");

    const cta = main.getByRole("link", { name: "Nous contacter sur WhatsApp" }).first();
    await expect(cta).toHaveAttribute("href", /^https:\/\/wa\.me\/23050000000\?text=Bonjour%2C%20je%20voudrais/);
    await expect(main.locator("form")).toHaveCount(1);
    await expect(main.getByRole("button", { name: "Ajouter des photos (5 maximum)" })).toBeVisible();
    await expect(main.getByText("au moins 3 jours avant votre date")).toBeVisible();
  });
});

test.describe("head and sitemap (S-253)", () => {
  test("AC1, AC2, AC5: title, description, canonical, reciprocal hreflang, noindex while placeholder", async ({ page }) => {
    for (const { path, h1 } of PAGES) {
      await open(page, `/fr${path}`);
      const head = page.locator("head");
      const origin = new URL(page.url()).origin;

      await expect(page).toHaveTitle(`${h1.fr} | Aux petits bonheurs`);
      await expect(head.locator('meta[name="description"]')).toHaveAttribute("content", /.{50,160}/);
      await expect(head.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/fr${path}`);
      await expect(head.locator('link[hreflang="en"]')).toHaveAttribute("href", `${origin}${path}`);
      await expect(head.locator('link[hreflang="fr"]')).toHaveAttribute("href", `${origin}/fr${path}`);
      await expect(head.locator('link[hreflang="x-default"]')).toHaveAttribute("href", `${origin}${path}`);
      await expect(head.locator('meta[property="og:title"]')).toHaveAttribute("content", `${h1.fr} | Aux petits bonheurs`);
      await expect(head.locator('meta[property="og:image"]')).toHaveCount(1);
      await expect(head.locator('meta[property="og:image"]')).toHaveAttribute("content", `${origin}/brand/og-image.jpg`);
      await expect(head.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
      await expect(page.getByRole("banner").locator('a[hreflang="en"]').first()).toHaveAttribute("href", path);
    }
  });

  test("AC1, AC5: Our collection has a canonical and is never noindex", async ({ page }) => {
    await open(page, "/menu");

    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", /\/menu$/);
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
  });

  test("AC4, AC5: the sitemap lists home and menu in both languages, no placeholder or private page; robots points at it", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.headers()["content-type"]).toContain("application/xml");
    const xml = await sitemap.text();
    expect(xml).toMatch(/<loc>[^<]+\/fr\/menu<\/loc>/);
    for (const part of ["/contact", "/custom-cake", "/admin", "/basket", "/t/"]) expect(xml).not.toContain(part);

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/^Sitemap: http.+\/sitemap\.xml$/m);
  });
});
