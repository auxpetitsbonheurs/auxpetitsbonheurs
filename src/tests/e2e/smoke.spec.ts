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

test("S-020 AC1: /healthz answers ok against the local database and Auth stub, never cached", async ({ request }) => {
  const response = await request.get("/healthz");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true, db: "ok", auth: "ok" });
  expect(response.headers()["cache-control"]).toBe("no-store");
});
