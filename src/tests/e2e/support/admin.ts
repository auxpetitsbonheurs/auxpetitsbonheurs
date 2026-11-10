// Admin sign-in through the real login page (against the local GoTrue stub).
import { type Page, expect } from "@playwright/test";
import type { E2eAccount } from "./auth-users";

export async function signIn(page: Page, account: E2eAccount, next?: string) {
  await page.goto(next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login");
  await page.getByRole("textbox", { name: /^(Email|E-mail)$/ }).fill(account.email);
  await page.getByLabel(/^(Password|Mot de passe)/).fill(account.password);
  await page.getByRole("button", { name: /^(Sign in|Se connecter)$/ }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}
