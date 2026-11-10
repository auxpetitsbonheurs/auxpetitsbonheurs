// Fixed clock for e2e specs (S-005 AC6). Sets the apb_test_now cookie, which the
// server honours only when TEST_CLOCK=on (development only, see env.server.ts).
import type { BrowserContext } from "@playwright/test";

export const TEST_CLOCK_COOKIE = "apb_test_now";

/** Makes every server-rendered "now" in this browser context equal `instant` (ISO, UTC). */
export async function setClock(context: BrowserContext, baseURL: string, instant: string) {
  if (Number.isNaN(Date.parse(instant))) throw new Error(`setClock: not an instant: ${instant}`);
  await context.addCookies([
    { name: TEST_CLOCK_COOKIE, value: new Date(instant).toISOString(), url: baseURL },
  ]);
}
