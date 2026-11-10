import { expectNoA11yViolations } from "./support/a11y";
import { expect, test } from "./support/fixtures";

const VIEWPORT_WIDTHS = [320, 375, 1280];

test("AC1: the built app serves the home page in this project's viewport", async ({ page }, testInfo) => {
  const width = testInfo.project.use.viewport?.width;
  expect(VIEWPORT_WIDTHS).toContain(width);

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  expect(page.viewportSize()?.width).toBe(width);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});
