// push_subscription rows (data-model.md): one per browser endpoint, owned by one admin.
import { and, eq } from "drizzle-orm";
import { admin, pushSubscription } from "~/db/schema";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";
import type { PushDevice } from "./push.server";

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const DEVICE = { id: pushSubscription.id, endpoint: pushSubscription.endpoint, p256dh: pushSubscription.p256dh, auth: pushSubscription.auth };

/**
 * Stores this browser for `adminId` (S-196 AC1). The same endpoint again updates its row
 * (never a duplicate); a browser another admin used before now belongs to whoever is signed in.
 */
export async function saveSubscription(db: Executor, adminId: string, input: SubscriptionInput, userAgent: string | null): Promise<void> {
  const values = { adminId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null, failureCount: 0 };
  await db
    .insert(pushSubscription)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { adminId, p256dh: values.p256dh, auth: values.auth, userAgent: values.userAgent, failureCount: 0 } });
}

export async function devicesOf(db: Executor, adminId: string): Promise<PushDevice[]> {
  return db.select(DEVICE).from(pushSubscription).where(eq(pushSubscription.adminId, adminId));
}

export interface PushRecipient {
  adminId: string;
  locale: Locale;
  device: PushDevice;
}

/** Every device of every active admin with push alerts on (alert matrix; FR-046). */
export async function pushRecipients(db: Executor): Promise<PushRecipient[]> {
  const rows = await db
    .select({ adminId: admin.id, locale: admin.locale, ...DEVICE })
    .from(pushSubscription)
    .innerJoin(admin, eq(admin.id, pushSubscription.adminId))
    .where(and(eq(admin.active, true), eq(admin.alertPush, true)));
  return rows.map(({ adminId, locale, ...device }) => ({ adminId, locale, device }));
}
