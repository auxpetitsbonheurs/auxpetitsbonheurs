// E-14 bakery reviews end to end (S-262, S-263, S-264, S-265, S-266, S-267, S-269): the journey
// runs once, on the 375 px phone (it changes the shared approved-review list); the layout,
// keyboard and axe checks run at every viewport, EN and FR, light and dark.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createE2eAdmin, signIn as adminSignIn } from "./support/admin";
import { createE2eCustomer, signInCustomer } from "./support/customer";
import { type Page, expect, test } from "./support/fixtures";

const SCREENSHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";

async function checkLayout(page: Page) {
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectKeyboardOperable(page);
    });
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expectNoA11yViolations(page);
  }
}

async function hydrated(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("S-262 the review form", () => {
  test("AC1: signed out, the page asks to sign in and comes back to the form after", async ({ page, db }) => {
    const customer = await createE2eCustomer(db);
    await hydrated(page, "/reviews/write");
    await expect(page.getByRole("heading", { name: "Sign in to leave a review" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your comment" })).toHaveCount(0);
    await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
    await expect(page).toHaveURL(/\/account\/sign-in\?next=%2Freviews%2Fwrite$/);
    await page.getByLabel("Email", { exact: true }).fill(customer.email);
    await page.getByLabel("Password", { exact: true }).fill(customer.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/reviews\/write$/);
    await expect(page.getByRole("radiogroup", { name: "Your rating" }).or(page.getByRole("group", { name: "Your rating" }))).toBeVisible();
  });

  test("AC2, AC4, AC10, S-269 AC1/AC2: keyboard stars, errors with a summary, layout and axe in EN and FR", async ({ page, db }) => {
    const customer = await createE2eCustomer(db, "Layout Check");
    await signInCustomer(page, customer, "/reviews/write");
    await hydrated(page, "/reviews/write");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByText("Choose from 1 to 5 stars.").first()).toBeVisible();

    await page.getByRole("radio", { name: "1 star" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "3 stars" })).toBeChecked();
    await expect(page.getByText("3 of 5", { exact: true })).toBeVisible();
    await page.getByLabel("Your comment").fill("x".repeat(1005));
    await expect(page.getByLabel("Your comment")).toHaveValue("x".repeat(1000));
    await expect(page.getByText("1000 of 1000 characters")).toBeVisible();
    await checkLayout(page);

    await hydrated(page, "/fr/reviews/write");
    await expect(page.getByRole("heading", { level: 1, name: "Écrire un avis" })).toBeVisible();
    await checkLayout(page);
  });
});

test.describe("S-269 AC4 the review journey", () => {
  test("post, approve from the badge, shown on Home and /reviews, edit hides it, hide, delete", async ({ browser, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "changes the shared approved reviews: runs once, on the phone");
    const customerPage = await (await browser.newContext({ viewport: { width: 375, height: 667 } })).newPage();
    const adminPage = await (await browser.newContext({ viewport: { width: 375, height: 667 } })).newPage();
    const customer = await createE2eCustomer(db, "Anna Kowalski");
    const admin = await createE2eAdmin(db, { name: "Reviewer Admin" });
    const comment = `Lovely cakes, journey ${Date.now()}`;

    // The customer posts a 5-star review.
    await signInCustomer(customerPage, customer, "/reviews/write");
    await hydrated(customerPage, "/reviews/write");
    await customerPage.getByRole("radio", { name: "5 stars" }).check({ force: true });
    await customerPage.getByLabel("Your comment").fill(comment);
    await customerPage.screenshot({ path: `${SCREENSHOTS}/reviews-2-form.png`, fullPage: true });
    await customerPage.getByRole("button", { name: "Send" }).click();
    const thanks = customerPage.getByRole("status").filter({ hasText: "Thank you. Your review will appear after we approve it." });
    await expect(thanks).toBeFocused();
    await expect(customerPage.getByText("Waiting for approval")).toBeVisible();

    // The admin sees the badge on More and approves it.
    await adminSignIn(adminPage, admin);
    await expect(adminPage.getByRole("link", { name: /^More ?, \d+ reviews? to approve$/ })).toBeVisible();
    await adminPage.getByRole("link", { name: /^More/ }).click();
    await adminPage.getByRole("link", { name: /^Reviews \(\d+\)$/ }).click();
    const approve = adminPage.getByRole("button", { name: "Approve review by Anna K." }).first();
    await expect(approve).toBeVisible();
    await adminPage.screenshot({ path: `${SCREENSHOTS}/reviews-3-admin-approval.png`, fullPage: true });
    await approve.click();
    await expect(adminPage.getByRole("status").filter({ hasText: "Review approved." })).toBeVisible();

    // Home and /reviews show it (this isolate's cache was cleared by the decision).
    await customerPage.goto("/");
    const section = customerPage.getByRole("region", { name: "What our customers say" }).or(customerPage.locator("section[aria-labelledby=home-reviews]"));
    await expect(section).toContainText(comment);
    await expect(section).toContainText("Anna K.");
    await customerPage.goto("/reviews");
    await expect(customerPage.getByText(comment)).toBeVisible();
    await customerPage.getByText(comment).scrollIntoViewIfNeeded();
    await customerPage.screenshot({ path: `${SCREENSHOTS}/reviews-4-on-site.png`, fullPage: true });
    await expect(customerPage.getByRole("contentinfo").getByRole("link", { name: "Reviews" })).toBeVisible();

    // An edit takes it off the site until approved again.
    await hydrated(customerPage, "/reviews/write");
    await expect(customerPage.getByText("Published", { exact: true })).toBeVisible();
    await customerPage.getByLabel("Your comment").fill(`${comment} (edited)`);
    await customerPage.getByRole("button", { name: "Save changes" }).click();
    await expect(customerPage.getByRole("status").filter({ hasText: "It will appear again after we approve it." })).toBeVisible();
    await customerPage.goto("/reviews");
    await expect(customerPage.getByText(comment, { exact: false })).toHaveCount(0);

    // Approve again, then hide: gone again, and "Not published" for the customer.
    await adminPage.goto("/admin/reviews");
    await adminPage.getByRole("button", { name: "Approve review by Anna K." }).first().click();
    await expect(adminPage.getByRole("status").filter({ hasText: "Review approved." })).toBeVisible();
    await adminPage.goto("/admin/reviews?tab=published");
    await adminPage.getByRole("button", { name: "Hide review by Anna K." }).first().click();
    await adminPage.getByRole("dialog").getByRole("button", { name: "Hide" }).click();
    await expect(adminPage.getByText("Review hidden.")).toBeVisible();
    await customerPage.goto("/reviews");
    await expect(customerPage.getByText(comment, { exact: false })).toHaveCount(0);
    await hydrated(customerPage, "/reviews/write");
    await expect(customerPage.getByText("Not published", { exact: true })).toBeVisible();

    // The customer deletes it.
    await customerPage.getByRole("button", { name: "Delete my review" }).click();
    await customerPage.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(customerPage.getByText("Your review was deleted.")).toBeVisible();
    await expect(customerPage.getByRole("button", { name: "Send" })).toBeVisible();
  });
});

test.describe("admin reviews and public pages layout (S-263 AC7, S-267 AC8, S-269 AC1)", () => {
  test("admin reviews: tabs, keyboard, 44 px targets, axe", async ({ page, db }) => {
    const admin = await createE2eAdmin(db);
    await adminSignIn(page, admin, "/admin/reviews");
    await expect(page.getByRole("heading", { level: 1, name: "Reviews" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^To approve \(\d+\)$/ })).toHaveAttribute("aria-current", "page");
    await checkLayout(page);
  });

  test("/reviews and /fr/reviews: one h1, layout and axe; no rating structured data", async ({ page }) => {
    for (const path of ["/reviews", "/fr/reviews"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(await page.locator('script[type="application/ld+json"]').allTextContents()).not.toContainEqual(expect.stringMatching(/AggregateRating|"Review"/));
      await checkLayout(page);
    }
  });
});
