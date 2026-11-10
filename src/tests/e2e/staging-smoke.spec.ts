// S-002 AC7 against the deployed staging site (NFR-010). Skipped unless STAGING_URL is set,
// e.g. STAGING_URL=https://auxpetitsbonheurs-staging.<subdomain>.workers.dev npx playwright test staging-smoke --project=desktop-1280
import { expect, test } from "@playwright/test";

const stagingUrl = process.env.STAGING_URL;

test.describe("staging smoke", () => {
  test.skip(!stagingUrl, "STAGING_URL is not set");

  test("AC7: staging pages are never indexed", async ({ request }) => {
    const response = await request.get(stagingUrl!, { maxRedirects: 0 });

    expect(response.status()).toBeLessThan(500);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });
});
