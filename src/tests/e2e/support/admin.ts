// Admin sign-in through the real login page (against the local GoTrue stub).
import { type BrowserContext, type Page, expect } from "@playwright/test";
import type { E2eAccount } from "./auth-users";

export async function signIn(page: Page, account: E2eAccount, next?: string) {
  await page.goto(next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login");
  await page.getByRole("textbox", { name: /^(Email|E-mail)$/ }).fill(account.email);
  await page.getByLabel(/^(Password|Mot de passe)/).fill(account.password);
  await page.getByRole("button", { name: /^(Sign in|Se connecter)$/ }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

const GOTRUE_STUB = "http://127.0.0.1:54321";
/** @supabase/ssr's cookie name for SUPABASE_URL http://127.0.0.1:54321 (first label of the host). */
const SESSION_COOKIE = "sb-127-auth-token";
const MAX_CHUNK = 3180;

/**
 * Gives the browser context a Supabase session for `account` without a sign-in page
 * (customers have no sign-in UI before E-11): a password grant at the GoTrue stub,
 * stored the way @supabase/ssr stores it (base64url, chunked). Returns the cookie names.
 */
export async function addSessionCookies(context: BrowserContext, baseURL: string, account: E2eAccount): Promise<string[]> {
  const response = await fetch(`${GOTRUE_STUB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!response.ok) throw new Error(`the GoTrue stub refused ${account.email}`);
  const value = `base64-${Buffer.from(JSON.stringify(await response.json())).toString("base64url")}`;
  const chunks = value.match(new RegExp(`.{1,${MAX_CHUNK}}`, "g")) ?? [];
  const named = chunks.length === 1 ? [{ name: SESSION_COOKIE, value }] : chunks.map((chunk, i) => ({ name: `${SESSION_COOKIE}.${i}`, value: chunk }));
  await context.addCookies(named.map((cookie) => ({ ...cookie, url: baseURL, httpOnly: true, sameSite: "Lax" as const })));
  return named.map((cookie) => cookie.name);
}
