// E2E test database (S-005 AC4). `resetDatabase` drops and recreates a LOCAL Postgres
// database, applies the Supabase stubs and every migration, and seeds the baseline:
// the sample product and one Owner. Specs then create their own order data with
// `createOrder`, which is parallel-safe (unique customer per call, atomic counter).
// Refuses any host other than localhost and any database name without "e2e".
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { SAMPLE_PHOTO, SAMPLE_PRODUCT } from "../../../app/db/sample-data";
import { SUPABASE_GRANTS, SUPABASE_STUBS } from "../../../app/db/testing/supabase-stubs";
import { E2E_ACCOUNTS } from "./auth-users";

/** Must match DATABASE_URL in the `e2e` environment of wrangler.jsonc (CI's Postgres service uses it too). */
export const E2E_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/apb_e2e";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export { SAMPLE_PRODUCT } from "../../../app/db/sample-data";

export { E2E_ACCOUNTS } from "./auth-users";
export const E2E_OWNER = { email: E2E_ACCOUNTS.owner.email, name: E2E_ACCOUNTS.owner.name } as const;

/** Settings policies text (S-013 AC14): placeholder wording, not the bakery's real policy. */
export const E2E_POLICIES = {
  en: "E2E policy: free cancellation until 48 hours before. Keep cakes cool.",
  fr: "Politique E2E : annulation gratuite jusqu'à 48 heures avant. Gardez les gâteaux au frais.",
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Database name, checked so it can be used as an identifier (identifiers cannot be bound). */
function e2eDatabaseName(url: URL): string {
  const name = url.pathname.slice(1);
  if (!LOCAL_HOSTS.has(url.hostname) || !/^[a-z0-9_]*e2e[a-z0-9_]*$/.test(name)) {
    throw new Error("E2E_DATABASE_URL must point at a local database whose name contains 'e2e'.");
  }
  return name;
}

const quiet = { max: 1, onnotice: () => {} } as const;

export function connectE2eDatabase(url = E2E_DATABASE_URL) {
  e2eDatabaseName(new URL(url));
  return postgres(url, quiet);
}

async function recreate(url: URL) {
  const name = e2eDatabaseName(url);
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const admin = postgres(maintenance.href, quiet);
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
}

/** The accounts the GoTrue stub accepts: auth users, admins (owner, helper, French, deactivated) and a customer. */
async function seedAccounts(sql: postgres.Sql) {
  for (const account of Object.values(E2E_ACCOUNTS)) {
    await sql`insert into auth.users (id, email, email_confirmed_at) values (${account.id}, ${account.email}, now())`;
    if (account.kind === "admin") {
      await sql`
        insert into admin (id, name, email, role, active, locale)
        values (${account.id}, ${account.name}, ${account.email}, ${account.role}, ${account.active}, ${account.locale})`;
    } else {
      await sql`insert into customer (name, phone, email, auth_user_id) values (${account.name}, '+23057000001', ${account.email}, ${account.id})`;
    }
  }
}

async function seedBaseline(sql: postgres.Sql) {
  await seedAccounts(sql);
  // Placeholder contact values so the footer shows its links (never real numbers).
  await sql`
    update settings set contact_whatsapp = '+230 5000 0000', contact_phone = '+230 5000 0001',
      contact_email = 'hello@example.com', policies = ${JSON.stringify(E2E_POLICIES)}::jsonb where id = 1`;
  const p = SAMPLE_PRODUCT;
  const [sample] = await sql<{ id: string }[]>`
    insert into product (slug, type, name_en, name_fr, description_en, description_fr, base_price_rs)
    values (${p.slug}, ${p.type}, ${p.nameEn}, ${p.nameFr}, ${p.descriptionEn}, ${p.descriptionFr}, ${p.basePriceRs})
    returning id`;
  const photo = SAMPLE_PHOTO;
  await sql`
    insert into product_photo (product_id, storage_path, width, height, sort_order)
    values (${sample!.id}, ${photo.storagePath}, ${photo.width}, ${photo.height}, ${photo.sortOrder})`;
}

/** Drops, migrates and seeds the e2e database. Run once per Playwright run (global setup). */
export async function resetDatabase(url = E2E_DATABASE_URL) {
  await recreate(new URL(url));
  const sql = postgres(url, quiet);
  try {
    await sql.unsafe(SUPABASE_STUBS);
    await migrate(drizzle({ client: sql }), { migrationsFolder });
    await sql.unsafe(SUPABASE_GRANTS);
    await seedBaseline(sql);
  } finally {
    await sql.end();
  }
}

export interface TestOrder {
  id: string;
  number: number;
  customerId: string;
  trackingToken: string;
}

/** Creates one pending pickup order for a fresh customer; safe to call from parallel specs. */
export async function createOrder(sql: postgres.Sql, label: string): Promise<TestOrder> {
  return sql.begin(async (tx) => {
    const phone = `+2305${String(randomBytes(4).readUInt32BE() % 10_000_000).padStart(7, "0")}`;
    const [customer] = await tx<{ id: string }[]>`
      insert into customer (name, phone) values (${label}, ${phone}) returning id`;
    const [counter] = await tx<{ value: number }[]>`
      update counter set value = value + 1 where name = 'order_number' returning value`;
    const trackingToken = randomBytes(32).toString("base64url");
    const window = { id: "am", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } };
    const [order] = await tx<{ id: string }[]>`
      insert into orders (number, source, status, customer_id, contact_name, contact_phone, fulfilment,
        fulfil_on, time_window, items_total_rs, total_rs, locale, tracking_token, idempotency_key)
      values (${counter!.value}, 'website', 'pending_approval', ${customer!.id}, ${label}, ${phone}, 'pickup',
        '2026-11-20', ${tx.json(window)}, 850, 850, 'en', ${trackingToken}, ${randomUUID()})
      returning id`;
    return { id: order!.id, number: counter!.value, customerId: customer!.id, trackingToken };
  });
}
