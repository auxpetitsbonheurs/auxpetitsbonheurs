// `admin/team` deactivate and reactivate (S-032, FR-043, FR-044). Admin rows are never
// deleted: a deactivated admin keeps their name on past order events (FR-045).
//
// Deactivate blocks access in the database first (one transaction: `active` false,
// `deactivated_at`, `sessions_revoked_at`, push subscriptions deleted), so the guard refuses
// the admin's very next request whatever happens next; then the Auth user is banned (no new
// sign-in, no session refresh). The ban is defence in depth: when it fails, the caller tells
// the Owner and retries it, and repeating the action is safe.
//
// Reactivate lifts the ban first, then sets `active` back; `sessions_revoked_at` is kept, so
// every device signed in before the deactivation must sign in again (password unchanged).
import { and, eq } from "drizzle-orm";
import { admin, pushSubscription } from "~/db/schema";
import { DomainError } from "~/domain/errors";
import type { Database } from "~/server/db.server";
import type { UserAdmin } from "~/server/user-admin.server";
import { lockForTeamChange } from "./last-owner.server";

export interface AccessChange {
  actorId: string;
  adminId: string;
  now: Date;
}

export type DeactivateOutcome = { ok: true; name: string; self: boolean; banned: boolean };
export type ReactivateOutcome = { ok: true; name: string } | { ok: false; code: "AUTH_FAILED"; name: string };

const log = (event: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: "info", event, ...fields }));

/** Throws DomainError NOT_FOUND / LAST_OWNER / FORBIDDEN; an already deactivated admin is banned again (Retry). */
export async function deactivateAdmin(db: Database, users: UserAdmin, change: AccessChange): Promise<DeactivateOutcome> {
  const target = await db.transaction(async (tx) => {
    const row = await lockForTeamChange(tx, { actorId: change.actorId, adminId: change.adminId, removesOwner: true });
    if (row.active) {
      await tx.update(admin).set({ active: false, deactivatedAt: change.now, sessionsRevokedAt: change.now }).where(eq(admin.id, row.id));
      await tx.delete(pushSubscription).where(eq(pushSubscription.adminId, row.id));
    }
    return row;
  });
  if (target.active) log("admin_deactivated");
  const banned = await banUser(users, target.id);
  return { ok: true, name: target.name, self: target.id === change.actorId, banned };
}

/** Bans the Auth user; a failure is logged without personal data and answered `false`. */
export async function banUser(users: UserAdmin, userId: string): Promise<boolean> {
  const banned = await users.setBanned(userId, true);
  if (!banned) console.error(JSON.stringify({ level: "error", event: "admin_ban_failed" }));
  return banned;
}

/** Throws DomainError NOT_FOUND / FORBIDDEN; `AUTH_FAILED` (nothing changed) when the ban could not be lifted. */
export async function reactivateAdmin(db: Database, users: UserAdmin, change: AccessChange): Promise<ReactivateOutcome> {
  const [current] = await db.select({ name: admin.name, active: admin.active }).from(admin).where(eq(admin.id, change.adminId)).limit(1);
  if (!current) throw new DomainError("NOT_FOUND", "no such admin");
  if (current.active) return { ok: true, name: current.name };
  // Ban lifted first: when it fails nothing changed, and the Owner simply tries again.
  if (!(await users.setBanned(change.adminId, false))) {
    console.error(JSON.stringify({ level: "error", event: "admin_unban_failed" }));
    return { ok: false, code: "AUTH_FAILED", name: current.name };
  }
  const name = await db.transaction(async (tx) => {
    const row = await lockForTeamChange(tx, { actorId: change.actorId, adminId: change.adminId, removesOwner: false });
    await tx.update(admin).set({ active: true, deactivatedAt: null }).where(and(eq(admin.id, row.id), eq(admin.active, false)));
    return row.name;
  });
  log("admin_reactivated");
  return { ok: true, name };
}
