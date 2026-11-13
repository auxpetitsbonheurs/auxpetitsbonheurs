// E-13 S-254: the accessibility and journey sweep over the 7 nav pages and the phone menu, in
// English and French, at 320, 375 and 1280 px (each project), light and dark.
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, withZoom } from "./support/a11y";
import { type Page, expect, test } from "./support/fixtures";

const PAGES = ["/", "/our-story", "/menu", "/custom-cake", "/workshops", "/gallery", "/contact"] as const;
const EN = ["Home", "Our story", "Our collection", "Custom order", "Workshops", "Gallery", "Contact us"];
const FR = ["Accueil", "Notre histoire", "Notre collection", "Gâteau sur mesure", "Ateliers", "Galerie", "Contact"];

const isLaptop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const menuButton = (page: Page, name: string) => page.getByRole("banner").getByRole("button", { name, exact: true });

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

const localized = (lang: "en" | "fr", path: string) => (lang === "en" ? path : path === "/" ? "/fr" : `/fr${path}`);

test.describe("S-254 AC1, AC2: every nav page, both languages, light and dark", () => {
  for (const lang of ["en", "fr"] as const) {
    for (const path of PAGES) {
      const url = localized(lang, path);
      test(`${url}: axe light and dark, no sideways scroll or clipping, 44 px targets, also at 200% zoom`, async ({ page }) => {
        await open(page, url);
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectNoA11yViolations(page);
        await withZoom(page, 2, async () => {
          await expectNoHorizontalScroll(page);
          await expectTapTargets(page);
        });
        await page.emulateMedia({ colorScheme: "dark" });
        await expectNoA11yViolations(page);
      });
    }
  }
});

test.describe("S-254 phone menu sweep", () => {
  test.beforeEach(({ page }) => {
    test.skip(isLaptop(page), "phone widths only");
  });

  for (const [lang, labels] of [["en", EN], ["fr", FR]] as const) {
    test(`AC1 (${lang}): the open menu is axe clean in light and dark`, async ({ page }) => {
      await open(page, localized(lang, "/gallery"));
      await menuButton(page, "Menu").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("link")).toHaveText(labels);
      await expectNoA11yViolations(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await expectNoA11yViolations(page);
    });

    test(`AC4 (${lang}): each of the 7 pages is 2 taps away (Menu, then the link)`, async ({ page }) => {
      await open(page, localized(lang, "/contact"));
      for (const [i, label] of labels.entries()) {
        await menuButton(page, "Menu").click();
        await page.getByRole("dialog").getByRole("link", { name: label, exact: true }).click();
        // The French home is /fr/ (trailing slash), the English one /.
        await expect(page).toHaveURL(new RegExp(`${localized(lang, PAGES[i]!).replace(/\//g, "\\/")}\/?$`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("dialog")).toBeHidden();
      }
    });
  }

  test("AC8: labels 40% longer (pseudo-locale) wrap in the open menu, never clip or overlap", async ({ page }) => {
    await open(page, "/fr");
    await menuButton(page, "Menu").click();
    const links = page.getByRole("dialog").getByRole("link");
    await links.evaluateAll((els) => {
      for (const el of els) el.textContent = `${el.textContent} ${"ÀÉÎ".repeat(Math.ceil((el.textContent ?? "").length * 0.4 / 3))}`;
    });
    await expectNoHorizontalScroll(page);
    const boxes = await links.evaluateAll((els) => els.map((el) => ({ ...el.getBoundingClientRect().toJSON(), clipped: el.scrollWidth > el.clientWidth + 1 })));
    for (const [i, box] of boxes.entries()) {
      expect(box.clipped, `link ${i} clips`).toBe(false);
      if (i > 0) expect(box.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom);
    }
  });
});

test.describe("S-254 AC8 laptop bar", () => {
  test.beforeEach(({ page }) => {
    test.skip(!isLaptop(page), "laptop width only");
  });

  test("French labels and a +40% pseudo-locale never clip or overlap in the header bar at 1280 px", async ({ page }) => {
    await open(page, "/fr/menu");
    const bar = page.getByRole("banner").getByRole("navigation").getByRole("link");
    await expect(bar).toHaveText(FR);
    await bar.evaluateAll((els) => {
      for (const el of els) el.textContent = `${el.textContent}${"É".repeat(Math.ceil((el.textContent ?? "").length * 0.4))}`;
    });
    await expectNoHorizontalScroll(page);
    const boxes = await bar.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 0.5);
  });
});
