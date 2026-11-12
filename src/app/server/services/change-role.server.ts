// `admin/team` changeRole (S-031, FR-043, FR-044): make an admin an Owner or an Admin. The
// new role applies to that person's very next request (the guard reads the row each time).
import { eq } from "drizzle-orm";
import { admin } from "~/db/schema";
import type { AdminRole } from "~/domain/admin-account";
import type { Database } from "~/server/db.server";
import { lockForTeamChange } from "./last-owner.server";

export interface RoleChange {
  /** The Owner making the change (checked again under the locks). */
  actorId: string;
  adminId: string;
  role: AdminRole;
}

export type ChangeRoleOutcome = { ok: true; name: string; from: AdminRole; to: AdminRole; self: boolean };

/**
 * One transaction: active Owners locked, the target locked, LAST_OWNER when it would demote
 * the only active Owner (themselves included), then the update. Throws DomainError
 * NOT_FOUND / LAST_OWNER / FORBIDDEN (the route maps them). Logs `admin_role_changed
 * {from,to}` without personal data when the role actually changed.
 */
export async function changeRole(db: Database, change: RoleChange): Promise<ChangeRoleOutcome> {
  const outcome = await db.transaction(async (tx) => {
    const target = await lockForTeamChange(tx, { actorId: change.actorId, adminId: change.adminId, removesOwner: change.role !== "owner" });
    if (target.role !== change.role) await tx.update(admin).set({ role: change.role }).where(eq(admin.id, target.id));
    return { ok: true as const, name: target.name, from: target.role, to: change.role, self: target.id === change.actorId };
  });
  if (outcome.from !== outcome.to) console.log(JSON.stringify({ level: "info", event: "admin_role_changed", from: outcome.from, to: outcome.to }));
  return outcome;
}
