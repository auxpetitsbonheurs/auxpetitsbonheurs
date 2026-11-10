// A signed-in admin for route tests: the row, a FakeAuth and a session cookie.
import type { TestDatabase } from "~/db/testing/pglite";
import { type TestAdminOptions, insertAdmin } from "./admins";
import { FakeAuth } from "./fake-auth";

export async function signedInAdmin(database: TestDatabase, options: TestAdminOptions = {}) {
  const auth = new FakeAuth();
  const admin = await insertAdmin(database, auth, options);
  return { auth, admin, cookie: auth.sessionCookie(admin.id, new Date("2026-11-09T08:00:00Z")) };
}
