// S-035: installing the admin app. Chromium cannot show its real install prompt in a test,
// so a `beforeinstallprompt` event is dispatched with a stub prompt (the page code under
// test is the real one). iOS Safari is a user agent with touch; standalone mode is a
// matchMedia override. Each test has its own browser context (its own localStorage).
import { expectKeyboardOperable, expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, withZoom } from "./support/a11y";
import { signIn } from "./support/admin";
import type { E2eAccount } from "./support/auth-users";
import { E2E_ACCOUNTS } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
const banner = (page: Page) => page.getByRole("region", { name: /^(Install the app|Installer l'application)$/ });

/** What Chrome does when the app is installable: a cancellable `beforeinstallprompt` with prompt() and userChoice. */
async function offerInstall(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await page.evaluate((choice) => {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    (window as unknown as { __prompted: number }).__prompted = 0;
    event.prompt = async () => void ((window as unknown as { __prompted: number }).__prompted += 1);
    event.userChoice = Promise.resolve({ outcome: choice });
    window.dispatchEvent(event);
  }, outcome);
}

async function openAdmin(page: Page, account: E2eAccount = E2E_ACCOUNTS.helper) {
  await signIn(page, account, "/admin/more");
  await hydrated(page);
}

test.describe("S-035 install the admin app", () => {
  test("AC1, AC2, AC6: manifest and service worker are public; sw.js is no-cache and registered for /admin/", async ({ page, playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    const manifest = await anonymous.get("/admin/manifest.webmanifest", { maxRedirects: 0 });
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ scope: "/admin/", start_url: "/admin/", display: "standalone" });
    const worker = await anonymous.get("/admin/sw.js", { maxRedirects: 0 });
    expect(worker.status()).toBe(200);
    expect(worker.headers()["cache-control"]).toBe("no-cache");
    for (const icon of ["/admin/icon-192.png", "/admin/icon-512.png", "/admin/icon-maskable-512.png"]) expect((await anonymous.get(icon)).status()).toBe(200);
    // The start URL opens the app.
    expect((await anonymous.get("/admin/", { maxRedirects: 0 })).status()).toBe(302);
    await anonymous.dispose();

    await openAdmin(page);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/admin/manifest.webmanifest");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/admin/");
  });

  test("AC3: the browser's offer shows Install; pressing it opens the native prompt and the banner goes", async ({ page }) => {
    await openAdmin(page);
    await expect(banner(page)).toHaveCount(0);

    await offerInstall(page);
    await banner(page).getByRole("button", { name: "Install" }).click();

    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
    await expect(banner(page)).toHaveCount(0);
  });

  test("AC3: Not now hides it and it does not return in this browser", async ({ page }) => {
    await openAdmin(page);
    await offerInstall(page);
    await banner(page).getByRole("button", { name: "Not now" }).click();
    await expect(banner(page)).toHaveCount(0);

    await page.reload();
    await hydrated(page);
    await offerInstall(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("AC7, AC8: at 100% and 200% keyboard-reachable, 44 px targets, polite, never over the bottom bar; axe light and dark; French text", async ({ page }) => {
    await openAdmin(page, E2E_ACCOUNTS.french);
    await offerInstall(page);
    const region = banner(page);
    await expect(region.getByRole("button", { name: "Installer" })).toBeVisible();
    await expect(region.getByRole("button", { name: "Plus tard" })).toBeVisible();
    await expect(page.locator('[role="status"][aria-live="polite"]').filter({ has: region })).toHaveCount(1);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
        const box = (await region.boundingBox())!;
        const bar = (await page.getByRole("navigation", { name: "Admin" }).boundingBox())!;
        const overlaps = box.y < bar.y + bar.height && bar.y < box.y + box.height;
        expect(overlaps).toBe(false);
      });
    }
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
  });
});

test.describe("S-035 iPhone", () => {
  test.use({ userAgent: IPHONE_SAFARI, hasTouch: true });

  test("AC4: iOS Safari shows the one-line Share hint once; dismissed, it stays hidden", async ({ page }) => {
    await openAdmin(page);
    const hint = banner(page);
    await expect(hint).toContainText("To install: tap Share, then Add to Home Screen");
    await expectTapTargets(page);
    await expectNoA11yViolations(page);

    await hint.getByRole("button", { name: "Hide this tip" }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await hydrated(page);
    await expect(banner(page)).toHaveCount(0);
  });

  test("AC5: installed (standalone), neither the hint nor the Install button shows", async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => (query.includes("display-mode: standalone") ? ({ ...original(query), matches: true } as MediaQueryList) : original(query));
    });
    await openAdmin(page);
    await offerInstall(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });
});
