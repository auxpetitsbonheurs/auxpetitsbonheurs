// Admin and customer accounts for unit tests: an auth.users row (the stub table),
// the admin or customer row, and the matching FakeAuth user.
import { randomUUID } from "node:crypto";
import type { TestDatabase } from "~/db/testing/pglite";
import type { FakeAuth } from "./fake-auth";

export const TEST_PASSWORD = "correct horse battery";

export interface TestAdminOptions {
  name?: string;
  email?: string;
  role?: "owner" | "admin";
  active?: boolean;
  locale?: "en" | "fr";
}

export async function insertAdmin(database: TestDatabase, auth: FakeAuth, options: TestAdminOptions = {}): Promise<{ id: string; email: string }> {
  const email = options.email ?? `admin-${randomUUID().slice(0, 8)}@example.com`;
  const id = auth.addUser(email, TEST_PASSWORD);
  await database.client.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
  await database.client.query("insert into admin (id, name, email, role, active, locale) values ($1, $2, $3, $4, $5, $6)", [
    id,
    options.name ?? "Sarah",
    email,
    options.role ?? "owner",
    options.active ?? true,
    options.locale ?? "en",
  ]);
  return { id, email };
}

/** A signed-up customer (auth user linked to a customer row), never an admin. */
export async function insertCustomerAccount(database: TestDatabase, auth: FakeAuth): Promise<{ id: string; email: string }> {
  const email = `customer-${randomUUID().slice(0, 8)}@example.com`;
  const id = auth.addUser(email, TEST_PASSWORD);
  await database.client.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
  await database.client.query("insert into customer (name, phone, email, auth_user_id) values ('Cliente', '+23057000000', $1, $2)", [email, id]);
  return { id, email };
}
