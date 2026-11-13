// Customer accounts in e2e (E-11): throwaway confirmed customers, orders for an email, and the
// emailed links the GoTrue stub "sent" (the hook's own link building is unit-tested).
import { randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { type Page, expect } from "./fixtures";

const GOTRUE_STUB = "http://127.0.0.1:54321";

export interface E2eCustomer {
  id: string;
  customerId: string;
  email: string;
  password: string;
  name: string;
}

/** A unique address on the reserved test domain. */
export const e2eEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@e2e.test`;

/** A confirmed customer account: auth user (stub + database) linked to a customer row. */
export async function createE2eCustomer(sql: postgres.Sql, name = "Aisha Kowalski"): Promise<E2eCustomer> {
  const id = randomUUID();
  const email = e2eEmail("customer");
  const password = `e2e-${randomUUID()}`;
  await sql`insert into auth.users (id, email, email_confirmed_at) values (${id}, ${email}, now())`;
  const [row] = await sql<{ id: string }[]>`insert into customer (name, phone, email, auth_user_id) values (${name}, '+23057123456', ${email}, ${id}) returning id`;
  const response = await fetch(`${GOTRUE_STUB}/__stub/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, email, password }),
  });
  if (!response.ok) throw new Error("the GoTrue stub refused the new account");
  return { id, customerId: row!.id, email, password, name };
}

/** A pending pickup order placed as a guest with `email` (customer row matched or made by email). */
export async function createOrderFor(sql: postgres.Sql, email: string, options: { status?: string; total?: number } = {}): Promise<{ number: number; trackingToken: string }> {
  return sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`select id from customer where lower(email) = ${email.toLowerCase()}`;
    const [made] = existing ? [existing] : await tx<{ id: string }[]>`insert into customer (name, phone, email) values ('Guest', '+23057000000', ${email}) returning id`;
    const [counter] = await tx<{ value: number }[]>`update counter set value = value + 1 where name = 'order_number' returning value`;
    const trackingToken = randomBytes(32).toString("base64url");
    const window = { id: "am", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } };
    await tx`
      insert into orders (number, source, status, customer_id, contact_name, contact_phone, contact_email, fulfilment,
        fulfil_on, time_window, items_total_rs, total_rs, locale, tracking_token, idempotency_key)
      values (${counter!.value}, 'website', ${options.status ?? "pending_approval"}, ${made!.id}, 'Guest', '+23057000000', ${email}, 'pickup',
        '2026-11-20', ${tx.json(window)}, ${options.total ?? 850}, ${options.total ?? 850}, 'en', ${trackingToken}, ${randomUUID()})`;
    return { number: counter!.value, trackingToken };
  });
}

/** The signup or sign-in link the stub "emailed" to `email`, as the page path the email links to. */
export async function emailedLink(email: string): Promise<string> {
  let sent: { type: string; tokenHash: string; redirectTo: string } | null = null;
  await expect
    .poll(async () => {
      const response = await fetch(`${GOTRUE_STUB}/__stub/link?email=${encodeURIComponent(email)}`);
      sent = response.ok ? ((await response.json()) as typeof sent) : null;
      return sent;
    })
    .not.toBeNull();
  const { type, tokenHash, redirectTo } = sent!;
  const next = new URL(redirectTo).searchParams.get("next") ?? "/";
  return `/auth/confirm?token_hash=${tokenHash}&type=${type}&next=${encodeURIComponent(next)}`;
}

/** Signs in on the customer page with a password and waits for the landing page. */
export async function signInCustomer(page: Page, customer: E2eCustomer, next?: string) {
  await page.goto(`/account/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByLabel("Email", { exact: true }).fill(customer.email);
  await page.getByLabel("Password", { exact: true }).fill(customer.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/account\/sign-in/);
}
