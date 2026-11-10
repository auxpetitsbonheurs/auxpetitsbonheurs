// Admin rows (data-model `admin`). Rows are never deleted (FR-043).
import { eq } from "drizzle-orm";
import { admin } from "~/db/schema";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export interface AdminRecord {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin";
  active: boolean;
  locale: Locale;
}

export async function findAdminById(db: Executor, id: string): Promise<AdminRecord | undefined> {
  const [row] = await db
    .select({ id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: admin.active, locale: admin.locale })
    .from(admin)
    .where(eq(admin.id, id))
    .limit(1);
  return row;
}

export async function recordSignIn(db: Executor, id: string, at: Date): Promise<void> {
  await db.update(admin).set({ lastSignInAt: at }).where(eq(admin.id, id));
}
