import { setClock } from "./clock";
import { expect, test } from "./fixtures";

test.describe("fixed clock (AC6)", () => {
  test("server-rendered dates use the spec's Mauritius 'now'", async ({ page, context, baseURL }) => {
    // 20:30 UTC on 31 Dec is 00:30 on 1 Jan in Mauritius (UTC+4).
    await setClock(context, baseURL!, "2030-12-31T20:30:00Z");

    await page.goto("/");

    await expect(page.getByRole("contentinfo")).toContainText("© 2031");
  });

  test("without a fixed clock the real date is used", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("contentinfo")).not.toContainText("2031");
  });
});
