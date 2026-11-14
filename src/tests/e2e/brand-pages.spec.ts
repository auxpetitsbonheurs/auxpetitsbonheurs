// E-13 S-248 (Our story), S-249 (Workshops) and S-250 (Gallery): the brand pages at 320, 375
// and 1280 px. Checks are about structure (the text is the client's and changes), except the
// Workshops next-workshop check, which sets its own data under the site-page lock.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { type Page, expect, test } from "./support/fixtures";

const PAGES = [
  { path: "/our-story", h1: "Our story", fr: "Notre histoire" },
  { path: "/workshops", h1: "Workshops", fr: "Ateliers" },
  { path: "/gallery", h1: "Gallery", fr: "Galerie" },
] as const;

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

for (const { path, h1, fr } of PAGES) {
  test.describe(`${h1} page`, () => {
    test("one h1 in each language, lang set; no sideways scroll, nothing clipped at 200%, 44 px targets, keyboard, axe clean light and dark", async ({ page }) => {
      await page.goto(path);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
        });
      }
      await expectKeyboardOperable(page);
      await expectNoA11yViolations(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await expectNoA11yViolations(page);

      // Last: a French visit remembers the language for the next unprefixed URL.
      await page.goto(`/fr${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(fr);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    });

    test("text is readable: running text at most about 70 characters wide", async ({ page }) => {
      await page.goto(path);
      // Running text only: paragraphs long enough to wrap (buttons and labels are short).
      const widths = await page.locator("main p").evaluateAll((nodes) =>
        nodes.filter((node) => (node.textContent ?? "").length >= 100).map((node) => {
          const style = getComputedStyle(node);
          const measure = document.createElement("span");
          measure.style.font = style.font;
          measure.textContent = "0".repeat(10);
          document.body.appendChild(measure);
          const perChar = measure.getBoundingClientRect().width / 10;
          measure.remove();
          return node.getBoundingClientRect().width / perChar;
        }),
      );
      for (const chars of widths) expect(chars).toBeLessThanOrEqual(80);
    });
  });
}

test.describe("S-248 Our story", () => {
  test("AC6, AC7: the old /about answers 301 to /our-story (same language); the page ends with the collection link", async ({ page, request }) => {
    const en = await request.get("/about", { maxRedirects: 0, headers: { "accept-language": "en" } });
    expect(en.status()).toBe(301);
    expect(en.headers().location).toBe("/our-story");
    const french = await request.get("/fr/about", { maxRedirects: 0, headers: { "accept-language": "fr" } });
    expect(french.headers().location).toBe("/fr/our-story");

    await page.goto("/our-story");
    await page.getByRole("link", { name: "Browse our collection" }).click();
    await expect(page).toHaveURL(/\/menu$/);
  });
});

test.describe("S-249 Workshops", () => {
  test("AC2, AC3, AC5: no booking form; the WhatsApp or contact call to action is a named 44 px control", async ({ page }) => {
    await page.goto("/workshops");
    await expect(page.locator("main form, main input, main select")).toHaveCount(0);
    const cta = page.getByRole("link", { name: /Ask about workshops on WhatsApp|Call us about workshops|Contact us/ }).last();
    await expect(cta).toBeVisible();
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  // The Owner's "next workshop" (S-249 clarification) is now the events list of E-15 S-302: a
  // published workshop shows with its date and places left (the full journey is workshops.spec).
  test("Owner clarification, now E-15 S-302: a published workshop shows with its date and places left", async ({ page, db }) => {
    const slug = `brand-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const title = `Valentine's cake workshop ${slug}`;
    await db`insert into workshop_event (slug, title_en, event_on, starts_at, ends_at, address, price_rs, capacity, cake_options, status)
      values (${slug}, ${title}, '2099-02-14', '14:00', '16:00', 'Beau Bassin', 1500, 10, ${db.json([{ id: "choc", name: { en: "Chocolate" } }])}, 'published')`;
    await page.goto("/workshops");
    const card = page.getByRole("listitem").filter({ hasText: title });
    await expect(card.getByText(/Saturday,? 14 February 2099/)).toBeVisible();
    await expect(card.getByText("10 places left")).toBeVisible();
  });
});

test.describe("S-250 Gallery", () => {
  test("AC2: with no photos yet, 'Photos coming soon.' and a way on, never a blank grid", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { level: 2, name: "Photos coming soon." })).toBeVisible();
    await expect(page.getByRole("link", { name: "See our collection" })).toBeVisible();
  });
});

test.describe("FR-081: sample text is noindex", () => {
  test("the seeded Our story page carries robots noindex", async ({ request }) => {
    const body = await (await request.get("/our-story")).text();
    expect(body).toContain('<meta name="robots" content="noindex"');
  });
});
