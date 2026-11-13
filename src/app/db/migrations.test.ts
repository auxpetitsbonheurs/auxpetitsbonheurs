import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "./testing/pglite";

const drizzleDir = fileURLToPath(new URL("../../drizzle/", import.meta.url));

describe("generated migration 0000 (AC2)", () => {
  const files = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql"));
  const generated = files.filter((f) => f.startsWith("0000_"));
  const sql = readFileSync(`${drizzleDir}${generated[0]}`, "utf8");
  const created = [...sql.matchAll(/CREATE TABLE "(?:public"\.")?(\w+)"/g)].map((m) => m[1]);
  const rls = [...sql.matchAll(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1]);

  test("exactly one generated migration 0000 exists", () => {
    expect(generated).toHaveLength(1);
  });

  test("0000 creates all 24 tables including product_slug_history", () => {
    expect(created).toHaveLength(24);
    expect(created).toContain("product_slug_history");
  });

  test("0000 enables row level security on every table", () => {
    expect([...rls].sort()).toEqual([...created].sort());
  });

  test("0000 never creates or alters Supabase's auth schema", () => {
    expect(sql).not.toMatch(/CREATE (TABLE|SCHEMA) "auth"/);
  });

  test("the journal lists 0000 first", () => {
    const journal = JSON.parse(readFileSync(`${drizzleDir}meta/_journal.json`, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };

    expect(journal.entries[0]?.tag).toBe(generated[0]?.replace(/\.sql$/, ""));
  });
});

describe("migrations applied to an empty Postgres (AC3-AC5, AC7)", () => {
  let database: TestDatabase;
  const query = <T>(text: string) => database.client.query<T>(text).then((r) => r.rows);

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 60_000);
  afterAll(async () => {
    await database.close();
  });

  test("AC3: settings holds the launch values in one row", async () => {
    const rows = await query<Record<string, unknown>>("select * from settings");
    const window = (id: string, start: string, end: string, en: string, fr: string) => ({
      id,
      start,
      end,
      label: { en, fr },
    });
    const windows = [
      window("morning", "09:00", "12:00", "Morning", "Matin"),
      window("afternoon", "12:00", "17:00", "Afternoon", "Après-midi"),
      window("evening", "17:00", "20:00", "Evening", "Soir"),
    ];

    expect(rows).toHaveLength(1);
    const settings = rows[0]!;
    expect(settings.delivery_fee_rs).toBe(200);
    expect(settings.pickup_address).toMatch(/Beau Bassin/);
    expect(settings.juice_number).toBe("5000 0000");
    expect(settings.default_notice_days).toBe(3);
    expect(settings.closed_weekdays).toEqual([7]);
    expect(settings.delivery_windows).toEqual(windows);
    expect(settings.pickup_windows).toEqual(windows);
    expect(settings.quote_validity_days).toBe(5);
    expect(settings.cake_message_max).toBe(40);
    expect(settings.evening_reminder_at).toBe("18:00");
    expect(settings.order_number_prefix).toBe("APB-");
  });

  test("AC3: the order number counter starts at 0", async () => {
    expect(await query("select name, value from counter")).toEqual([
      { name: "order_number", value: 0 },
    ]);
  });

  test("AC4: a second settings row is refused by the singleton check", async () => {
    await expect(
      query(
        `insert into settings (id, delivery_windows, pickup_windows) values (2, '[]', '[]')`,
      ),
    ).rejects.toThrow(/settings_singleton_ck/);
  });

  describe("AC4: orders are unique by number, tracking token and idempotency key", () => {
    let customerId = "";
    const insertOrder = (number: number, token: string, key: string) =>
      database.client.query(
        `insert into orders (number, source, status, customer_id, contact_name, contact_phone,
           fulfilment, fulfil_on, time_window, items_total_rs, total_rs, locale, tracking_token, idempotency_key)
         values ($1, 'website', 'pending_approval', $2, 'Test', '+23050000000',
           'pickup', '2026-12-01', '{}', 100, 100, 'en', $3, $4)`,
        [number, customerId, token, key],
      );

    beforeAll(async () => {
      const [row] = await query<{ id: string }>(
        `insert into customer (name, phone) values ('Test', '+23050000000') returning id`,
      );
      customerId = row!.id;
      await insertOrder(1, "token-1", "00000000-0000-4000-8000-000000000001");
    });

    test("same number is refused", async () => {
      await expect(
        insertOrder(1, "token-2", "00000000-0000-4000-8000-000000000002"),
      ).rejects.toThrow(/orders_number_unique/);
    });

    test("same tracking token is refused", async () => {
      await expect(
        insertOrder(2, "token-1", "00000000-0000-4000-8000-000000000003"),
      ).rejects.toThrow(/orders_tracking_token_unique/);
    });

    test("same idempotency key is refused", async () => {
      await expect(
        insertOrder(3, "token-3", "00000000-0000-4000-8000-000000000001"),
      ).rejects.toThrow(/orders_idempotency_key_unique/);
    });
  });

  test.each(["orders", "customer", "settings"])(
    "AC5: the anon role reads no rows from %s (RLS on, no policies)",
    async (table) => {
      const rows = await database.client.transaction(async (tx) => {
        await tx.exec("set local role anon");
        return (await tx.query(`select * from ${table}`)).rows;
      });

      expect(rows).toEqual([]);
    },
  );

  test("AC5: the anon role cannot write either", async () => {
    await expect(
      database.client.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query(`insert into counter (name, value) values ('x', 1)`);
      }),
    ).rejects.toThrow(/row-level security/);
  });

  test("AC7: both Storage buckets exist with image MIME types, 1 MB limit, request-photos private", async () => {
    const buckets = await query(
      "select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id",
    );
    const mime = ["image/jpeg", "image/png", "image/webp"];

    expect(buckets).toEqual([
      { id: "public-images", name: "public-images", public: true, file_size_limit: 1048576, allowed_mime_types: mime },
      { id: "request-photos", name: "request-photos", public: false, file_size_limit: 1048576, allowed_mime_types: mime },
    ]);
  });

  test("S-276 AC5: 0011 adds variant widths to every photo table and the Settings images, empty by default", async () => {
    const columns = await query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string }>(
      `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and column_name in ('variant_widths', 'hero_image_variants', 'about_image_variants') order by table_name, column_name`,
    );

    expect(columns.map((c) => [c.table_name, c.column_name, c.data_type, c.is_nullable])).toEqual([
      ["gallery_photo", "variant_widths", "ARRAY", "NO"],
      ["product_photo", "variant_widths", "ARRAY", "NO"],
      ["settings", "about_image_variants", "ARRAY", "NO"],
      ["settings", "hero_image_variants", "ARRAY", "NO"],
      ["site_page_photo", "variant_widths", "ARRAY", "NO"],
    ]);
    expect(columns.every((c) => c.column_default.startsWith("'{}'"))).toBe(true);
    expect(await query("select hero_image_variants, about_image_variants from settings")).toEqual([{ hero_image_variants: [], about_image_variants: [] }]);
  });

  test("Juice payment (S-277..S-281): awaiting_payment comes first in order_status; the new columns are nullable; Settings has no Juice name yet", async () => {
    const [{ labels }] = (await query<{ labels: string[] }>("select enum_range(null::order_status)::text[] as labels")) as [{ labels: string[] }];
    expect(labels.slice(0, 2)).toEqual(["awaiting_payment", "pending_approval"]);
    const columns = await query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns where table_schema = 'public'
       and ((table_name = 'orders' and column_name in ('payment_reminder_sent_at', 'cancel_reason', 'refund_due_rs', 'refunded_at', 'refunded_by'))
         or (table_name = 'settings' and column_name in ('juice_name', 'payment_whatsapp'))) order by column_name`,
    );
    expect(columns).toHaveLength(7);
    expect(columns.every((c) => c.is_nullable === "YES")).toBe(true);
    expect(await query("select juice_name, payment_whatsapp from settings")).toEqual([{ juice_name: null, payment_whatsapp: null }]);
  });

  test("Juice payment: the migration is forward-only and never uses the new enum value outside the procedure body", () => {
    const file = readdirSync(drizzleDir).find((f) => f.endsWith("_juice_payment.sql"))!;
    const sql = readFileSync(`${drizzleDir}${file}`, "utf8").replace(/^--.*$/gm, "");
    const body = sql.indexOf('CREATE OR REPLACE PROCEDURE "public"."place_order"');

    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(body).toBeGreaterThan(0);
    // Postgres refuses a new enum value in the transaction that added it, except inside a function body run later.
    expect(sql.slice(0, body).match(/awaiting_payment/g)).toHaveLength(1);
  });

  test("S-276 AC5: 0011 is additive only (ADD COLUMN, nothing dropped or rewritten)", () => {
    const sql = readFileSync(`${drizzleDir}0011_photo_variants.sql`, "utf8").replace(/^--.*$/gm, "");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

    expect(statements).toHaveLength(5);
    expect(statements.every((s) => /^ALTER TABLE "\w+" ADD COLUMN "\w+" smallint\[\] DEFAULT '\{\}'::smallint\[\] NOT NULL;$/.test(s))).toBe(true);
  });
});
