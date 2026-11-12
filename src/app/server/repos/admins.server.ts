// Admin rows (data-model `admin`). Rows are never deleted (FR-043).
import { and, count, eq, sql } from "drizzle-orm";
import { admin, pushSubscription } from "~/db/schema";
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

const RECORD = { id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: admin.active, locale: admin.locale };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findAdminById(db: Executor, id: string): Promise<AdminRecord | undefined> {
  if (!UUID.test(id)) return undefined;
  const [row] = await db.select(RECORD).from(admin).where(eq(admin.id, id)).limit(1);
  return row;
}

/** The active admin with this email (any case), for the forgot-password request (S-025). */
export async function findActiveAdminByEmail(db: Executor, email: string): Promise<AdminRecord | undefined> {
  const [row] = await db
    .select(RECORD)
    .from(admin)
    .where(and(sql`lower(${admin.email}) = ${email.trim().toLowerCase()}`, eq(admin.active, true)))
    .limit(1);
  return row;
}

export async function recordSignIn(db: Executor, id: string, at: Date): Promise<void> {
  await db.update(admin).set({ lastSignInAt: at }).where(eq(admin.id, id));
}

export interface AdminProfile {
  name: string;
  email: string;
  locale: Locale;
  alertPush: boolean;
  alertEmail: boolean;
  pushDevices: number;
}

/** My profile (S-036): the admin's own row and how many push devices they registered. */
export async function readProfile(db: Executor, id: string): Promise<AdminProfile | undefined> {
  const [row] = await db
    .select({ name: admin.name, email: admin.email, locale: admin.locale, alertPush: admin.alertPush, alertEmail: admin.alertEmail })
    .from(admin)
    .where(eq(admin.id, id))
    .limit(1);
  if (!row) return undefined;
  const [devices] = await db.select({ n: count() }).from(pushSubscription).where(eq(pushSubscription.adminId, id));
  return { ...row, pushDevices: Number(devices?.n ?? 0) };
}

export async function updateProfile(db: Executor, id: string, values: { name: string; locale: Locale }): Promise<void> {
  await db.update(admin).set(values).where(eq(admin.id, id));
}

export async function setAlerts(db: Executor, id: string, values: { alertPush: boolean; alertEmail: boolean }): Promise<void> {
  await db.update(admin).set(values).where(eq(admin.id, id));
}
