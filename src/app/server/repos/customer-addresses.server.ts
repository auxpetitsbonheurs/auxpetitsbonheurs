// Saved delivery addresses (E-11 S-211; contracts.md `account/addresses`). Every call is scoped to
// the session's customer row: another customer's id is NOT_FOUND and changes nothing (AC5). At most
// one default per customer: setting one clears the others in the same transaction, and the partial
// unique index `customer_address_default_uq` backs it up (AC3, AC6). Orders copy the address, so
// deleting one never changes a past order (AC4).
import { and, asc, desc, eq } from "drizzle-orm";
import { customerAddress } from "~/db/schema";
import type { Database, Executor } from "~/server/db.server";

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  landmark: string | null;
  isDefault: boolean;
}

export interface AddressInput {
  label: string;
  address: string;
  landmark: string | null;
  isDefault: boolean;
}

const columns = { id: customerAddress.id, label: customerAddress.label, address: customerAddress.address, landmark: customerAddress.landmark, isDefault: customerAddress.isDefault };

/** The customer's addresses, the default first, then newest. */
export async function listAddresses(db: Executor, customerId: string): Promise<SavedAddress[]> {
  const rows = await db.select(columns).from(customerAddress).where(eq(customerAddress.customerId, customerId)).orderBy(desc(customerAddress.isDefault), desc(customerAddress.createdAt), asc(customerAddress.id));
  return rows.map((row) => ({ ...row, label: row.label ?? "" }));
}

async function clearDefault(db: Executor, customerId: string) {
  await db.update(customerAddress).set({ isDefault: false }).where(and(eq(customerAddress.customerId, customerId), eq(customerAddress.isDefault, true)));
}

export async function addAddress(db: Database, customerId: string, input: AddressInput): Promise<SavedAddress> {
  return db.transaction(async (tx) => {
    if (input.isDefault) await clearDefault(tx, customerId);
    const [row] = await tx.insert(customerAddress).values({ customerId, ...input }).returning(columns);
    return { ...row!, label: row!.label ?? "" };
  });
}

/** `false` when the id is not one of this customer's addresses (NOT_FOUND). */
export async function updateAddress(db: Database, customerId: string, id: string, input: AddressInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [own] = await tx.select({ id: customerAddress.id }).from(customerAddress).where(and(eq(customerAddress.id, id), eq(customerAddress.customerId, customerId))).for("update");
    if (!own) return false;
    if (input.isDefault) await clearDefault(tx, customerId);
    await tx.update(customerAddress).set(input).where(and(eq(customerAddress.id, id), eq(customerAddress.customerId, customerId)));
    return true;
  });
}

/** `false` when the id is not one of this customer's addresses (NOT_FOUND). */
export async function deleteAddress(db: Executor, customerId: string, id: string): Promise<boolean> {
  const deleted = await db.delete(customerAddress).where(and(eq(customerAddress.id, id), eq(customerAddress.customerId, customerId))).returning({ id: customerAddress.id });
  return deleted.length > 0;
}
