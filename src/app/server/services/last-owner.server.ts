// The last-Owner rule (FR-044), shared by changeRole (S-031) and deactivate (S-032). Every
// Team change that can touch an Owner locks the active Owners first, in id order and in one
// statement, so two Owners acting on each other at once queue on the same locks (no
// deadlock), and the second re-reads the set after the first commits (READ COMMITTED
// re-checks a locked row's WHERE): it then sees one Owner and gets LAST_OWNER.
import { and, asc, eq } from "drizzle-orm";
import { admin } from "~/db/schema";
import { DomainError } from "~/domain/errors";
import type { Executor } from "~/server/db.server";

export interface AdminRow {
  id: string;
  name: string;
  role: "owner" | "admin";
  active: boolean;
}

/** The active Owners' ids, locked `FOR UPDATE` until the transaction ends. */
export async function lockActiveOwners(tx: Executor): Promise<string[]> {
  const rows = await tx
    .select({ id: admin.id })
    .from(admin)
    .where(and(eq(admin.role, "owner"), eq(admin.active, true)))
    .orderBy(asc(admin.id))
    .for("update");
  return rows.map((row) => row.id);
}

/**
 * Locks the active Owners and throws `LAST_OWNER` when `adminId` is the only one; returns
 * the locked Owners' ids. Call it before taking away an active Owner's role or access.
 */
export async function assertNotLastOwner(tx: Executor, adminId: string): Promise<string[]> {
  const owners = await lockActiveOwners(tx);
  if (owners.includes(adminId) && owners.length <= 1) throw new DomainError("LAST_OWNER", "would leave no active Owner");
  return owners;
}

/** The target admin row, locked for this transaction; undefined when there is none. */
export async function lockAdmin(tx: Executor, id: string): Promise<AdminRow | undefined> {
  const [row] = await tx.select({ id: admin.id, name: admin.name, role: admin.role, active: admin.active }).from(admin).where(eq(admin.id, id)).for("update");
  return row;
}

/**
 * Owners are locked first (always, so every Team change takes locks in the same order), then
 * the target. The actor must still be an active Owner once the locks are held: one demoted or
 * deactivated a moment earlier gets FORBIDDEN.
 */
export async function lockForTeamChange(tx: Executor, change: { actorId: string; adminId: string; removesOwner: boolean }): Promise<AdminRow> {
  const owners = change.removesOwner ? await assertNotLastOwner(tx, change.adminId) : await lockActiveOwners(tx);
  const target = await lockAdmin(tx, change.adminId);
  if (!target) throw new DomainError("NOT_FOUND", "no such admin");
  if (!owners.includes(change.actorId)) throw new DomainError("FORBIDDEN", "the actor is no longer an active Owner");
  return target;
}
