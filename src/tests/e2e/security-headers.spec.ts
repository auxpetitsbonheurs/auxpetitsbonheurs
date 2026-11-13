// S-228 AC7 (NFR-003): every page carries the security headers and a nonce-based CSP, and the CSP
// breaks nothing: browsing pages still hydrate through the deferred loader, form and admin pages
// hydrate at once, and the browser reports no policy violation on the way.
import { type Page, expect, test } from "./support/fixtures";
import { addSessionCookies, createE2eAdmin } from "./support/admin";

const BASELINE = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
};

/** Collects CSP violations the page reports (event and console), from the first byte. */
async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return violations;
}

test.describe("response headers", () => {
  test("pages get the baseline headers and a CSP whose nonce is on every inline script", async ({ request }) => {
    for (const path of ["/", "/fr/menu", "/basket", "/custom-cake", "/admin/login", "/no-such-page"]) {
      const response = await request.get(path);
      const headers = response.headers();
      for (const [name, value] of Object.entries(BASELINE)) expect(headers[name], `${path} ${name}`).toBe(value);
      expect(headers["referrer-policy"], path).toMatch(/^(strict-origin-when-cross-origin|no-referrer)$/);
      const csp = headers["content-security-policy"] ?? "";
      const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
      expect(nonce, `${path} CSP nonce`).toBeTruthy();
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).not.toContain("'unsafe-inline' 'nonce");
      const html = await response.text();
      const inline = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!).filter((attrs) => !/\bsrc=|type="(application\/ld\+json|text\/plain)"/.test(attrs));
      expect(inline.length, path).toBeGreaterThan(0);
      for (const attrs of inline) expect(attrs, path).toContain(`nonce="${nonce}"`);
    }
  });

  test("each page view gets a fresh nonce", async ({ request }) => {
    const nonceOf = async () => /'nonce-([^']+)'/.exec((await request.get("/")).headers()["content-security-policy"] ?? "")?.[1];
    expect(await nonceOf()).not.toBe(await nonceOf());
  });

  test("JSON endpoints get the baseline headers and no CSP", async ({ request }) => {
    const response = await request.get("/api/menu");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["content-security-policy"]).toBeUndefined();
  });
});

test.describe("the CSP breaks nothing", () => {
  test("a browsing page hydrates through the deferred loader with no violation", async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 15_000 });
    expect(violations).toEqual([]);
  });

  test("form pages (basket, custom cake) hydrate at once with no violation", async ({ page }) => {
    const violations = await watchViolations(page);
    for (const path of ["/fr/basket", "/custom-cake"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    }
    expect(violations).toEqual([]);
  });

  test("the admin app hydrates and navigates with no violation", async ({ page, context, db, baseURL }) => {
    const violations = await watchViolations(page);
    await addSessionCookies(context, baseURL!, await createE2eAdmin(db));
    await page.goto("/admin");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.goto("/admin/menu");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    expect(violations).toEqual([]);
  });
});
