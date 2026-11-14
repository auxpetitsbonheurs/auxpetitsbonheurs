// `findCustomer` for manual orders (FR-057, S-133): the customer by email (any case) and by phone
// (any format; `domain/customer-match`), at most one, with only the fields the form shows.
import { count, eq, sql } from "drizzle-orm";
import { customer, orders } from "~/db/schema";
import { type Match, chooseMatch, phoneKeys } from "~/domain/customer-match";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export interface MatchedCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  locale: Locale;
  orderCount: number;
}

const columns = { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, locale: customer.locale };
type Row = { id: string; name: string; phone: string; email: string | null; locale: Locale };

async function byEmail(db: Executor, email: string | undefined): Promise<Row | null> {
  if (!email) return null;
  const [row] = await db.select(columns).from(customer).where(sql`lower(${customer.email}) = ${email.toLowerCase()}`).limit(1);
  return row ?? null;
}

async function byPhone(db: Executor, phone: string | undefined): Promise<Row | null> {
  const keys = phone ? phoneKeys(phone) : [];
  if (keys.length === 0) return null;
  // The oldest customer with that number: the one most likely to be "them".
  const [row] = await db
    .select(columns)
    .from(customer)
    .where(sql`regexp_replace(${customer.phone}, '\\D', '', 'g') in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`)
    .orderBy(customer.createdAt)
    .limit(1);
  return row ?? null;
}

export async function findMatchingCustomer(db: Executor, input: { phone?: string; email?: string }): Promise<Match<MatchedCustomer>> {
  const [email, phone] = await Promise.all([byEmail(db, input.email), byPhone(db, input.phone)]);
  const match = chooseMatch(email, phone);
  if (!match.customer) return { customer: null, conflict: false };
  const [orderCount] = await db.select({ n: count() }).from(orders).where(eq(orders.customerId, match.customer.id));
  return { customer: { ...match.customer, orderCount: Number(orderCount?.n ?? 0) }, conflict: match.conflict };
}
