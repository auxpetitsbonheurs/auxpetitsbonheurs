// S-230 AC5 (NFR-008): a phone set to another time zone still sees Mauritius dates. The clock is
// fixed at 2026-11-20 21:30 UTC, which is already Saturday 21 November 01:30 in Mauritius
// (UTC+4) but still Friday 16:30 in New York. Settings: notice 3 days, Sunday closed, so the
// earliest date is Tuesday 24 November for everyone. A browser that counted from its own date
// would offer Monday 23 November in New York.
import { createProduct } from "./support/catalogue";
import { setClock } from "./support/clock";
import { expect, test } from "./support/fixtures";

const NOW = "2026-11-20T21:30:00Z";

for (const timezoneId of ["Indian/Mauritius", "America/New_York", "Asia/Tokyo"]) {
  test.describe(`a phone set to ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("the checkout calendar follows Mauritius time: earliest date, today's notice and the days before it", async ({ page, db, baseURL }) => {
      const product = await createProduct(db, { name: `Time zone cake ${timezoneId}` });
      await setClock(page.context(), baseURL!, NOW);
      const line = { lineId: "tz1", productId: product.id, options: [], quantity: 1 };
      await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify([line])), url: baseURL!, sameSite: "Lax" }]);

      await page.goto("/basket");
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

      await expect(page.getByText("Earliest date: Tue 24 Nov")).toBeVisible();
      const grid = page.getByRole("grid");
      await expect(grid.locator('[data-date="2026-11-23"]')).toHaveAttribute("aria-disabled", "true");
      await expect(grid.locator('[data-date="2026-11-24"]')).not.toHaveAttribute("aria-disabled", "true");
      // Saturday 21 November is "today" in Mauritius: too soon, not "passed".
      await expect(page.getByRole("gridcell", { name: /^Saturday 21 November, not available: Too soon/ })).toBeVisible();
    });
  });
}
