// Customer matching for website orders (contracts.md "Customer matching", threat-model
// G-02): exact lower-cased email match, else a new row. Never by phone alone, and an
// existing row's email and auth_user_id are never written here.
import { sql } from "drizzle-orm";
import { customer } from "~/db/schema";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export interface GuestContact {
  name: string;
  /** E.164. */
  phone: string;
  /** Already lower-cased by the contract schema. */
  email: string;
}

async function findByEmail(db: Executor, email: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(sql`lower(${customer.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return row?.id;
}

/** The customer a guest order attaches to (id); creates one for a new email. */
export async function resolveGuestCustomer(db: Executor, contact: GuestContact, locale: Locale): Promise<string> {
  const existing = await findByEmail(db, contact.email);
  if (existing) return existing;
  const [created] = await db
    .insert(customer)
    .values({ name: contact.name, phone: contact.phone, email: contact.email.toLowerCase(), locale })
    .returning({ id: customer.id });
  return created!.id;
}
