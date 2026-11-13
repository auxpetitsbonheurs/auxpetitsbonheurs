// S-225 (NFR-004): the short privacy note in EN and FR says what is collected, why, who sees it,
// how long it is kept and how to ask for erasure (AC1); it states the forwarded-email limit (AC3);
// every form that asks for personal details links to it near its submit button (AC4).
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets } from "./support/a11y";
import { SAMPLE_PRODUCT } from "./support/database";
import { expect, test } from "./support/fixtures";

test.describe("the privacy note (AC1, AC3)", () => {
  test("English: what, why, who sees it, how long, erasure within 30 days, the forwarded email", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy note" })).toBeVisible();
    const main = page.getByRole("main");
    for (const heading of ["Who is responsible", "What we collect and why", "Who sees your details", "Cookies", "Your order link", "How long we keep it", "Your choices", "The law"]) {
      await expect(main.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    }
    await expect(main).toContainText("delivery address");
    await expect(main).toContainText("up to 5 photos");
    await expect(main).toContainText("Only the bakery team");
    await expect(main).toContainText("answers within 30 days");
    await expect(main).toContainText("please do not forward the email");
    await expect(main).toContainText("Email contents: 90 days.");
    await expect(main).toContainText("no advertising or tracking cookies");
    // Open Owner decisions are shown as such, never invented (AC7), and keep the page unindexed.
    await expect(main).toContainText("Business Registration Number: [to be confirmed]");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);
  });

  test("French: the same note in French, with its own address", async ({ page }) => {
    await page.goto("/fr/privacy");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Note de confidentialité" })).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 2, name: "Combien de temps nous les gardons" })).toBeVisible();
    await expect(main).toContainText("répond sous 30 jours");
    await expect(main).toContainText("merci de ne pas transférer l'e-mail");
    await expect(main).toContainText("[à confirmer]");
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
  });

  test("the footer links to it in both languages", async ({ page }) => {
    await page.goto("/menu");
    await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await page.goto("/fr/menu");
    await page.getByRole("contentinfo").getByRole("link", { name: "Confidentialité", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/privacy$/);
  });
});

test.describe("forms link to it near the submit button (AC4)", () => {
  test("/basket (checkout)", async ({ page }) => {
    await page.goto(`/menu/${SAMPLE_PRODUCT.slug}`);
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" }).or(page.getByRole("heading", { level: 1, name: "Your basket" }))).toBeVisible();
    await page.goto("/basket");
    await expect(page.getByRole("button", { name: /Place order/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "privacy note", exact: true })).toHaveAttribute("href", "/privacy");
  });

  for (const path of ["/custom-cake", "/account/sign-up", "/fr/account/sign-up"]) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path);
      const link = page.getByRole("link", { name: /^(privacy note|note de confidentialité)$/ });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", path.startsWith("/fr") ? "/fr/privacy" : "/privacy");
    });
  }
});
