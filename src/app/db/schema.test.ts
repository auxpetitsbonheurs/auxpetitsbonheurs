import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import * as schema from "./schema";

const tables: PgTable[] = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  is(value, PgTable),
);

function config(name: string) {
  const table = tables.find((t) => getTableConfig(t).name === name);
  if (!table) throw new Error(`table ${name} not in schema`);
  return getTableConfig(table);
}

describe("schema invariants (docs/architecture/data-model.md)", () => {
  test("every public table has RLS enabled so the anon key can read nothing", () => {
    // Arrange / Act
    const withoutRls = tables.map(getTableConfig).filter((c) => !c.enableRLS);

    // Assert
    expect(withoutRls.map((c) => c.name)).toEqual([]);
  });

  test("the schema has exactly 30 tables (24 in 0000, incl. product_slug_history; storage_purge added by 0003, S-045; site_page and site_page_photo by 0008, E-13 S-245; usage_counter by 0017, S-217; review and review_event by 0018, S-261)", () => {
    expect(tables).toHaveLength(30);
  });

  test("storage_purge queues objects by bucket and path, with RLS (S-045 AC6)", () => {
    const queue = config("storage_purge");
    expect(queue.primaryKeys[0]?.columns.map((c) => c.name)).toEqual(["bucket", "path"]);
    expect(queue.enableRLS).toBe(true);
  });

  test("product_slug_history keeps old slugs, cascades with the product and has RLS", () => {
    const history = config("product_slug_history");
    const column = (name: string) => history.columns.find((c) => c.name === name);
    const [fk] = history.foreignKeys;
    const reference = fk?.reference();

    expect(history.columns.map((c) => c.name).sort()).toEqual(["created_at", "product_id", "slug"]);
    expect(column("slug")?.primary).toBe(true);
    expect(column("slug")?.getSQLType()).toBe("text");
    expect(column("product_id")?.notNull).toBe(true);
    expect(column("product_id")?.getSQLType()).toBe("uuid");
    expect(column("created_at")?.notNull).toBe(true);
    expect(column("created_at")?.getSQLType()).toBe("timestamp with time zone");
    expect(column("created_at")?.hasDefault).toBe(true);
    expect(history.foreignKeys).toHaveLength(1);
    expect(getTableConfig(reference!.foreignTable).name).toBe("product");
    expect(reference?.columns.map((c) => c.name)).toEqual(["product_id"]);
    expect(fk?.onDelete).toBe("cascade");
    expect(history.enableRLS).toBe(true);
  });

  test("auth.users is not exported, so drizzle-kit never manages it", () => {
    expect(tables.map((t) => getTableConfig(t).schema)).not.toContain("auth");
  });

  test("order number, tracking token and idempotency key are unique", () => {
    const columns = config("orders").columns;
    const unique = columns.filter((c) => c.isUnique).map((c) => c.name);

    expect(unique).toEqual(
      expect.arrayContaining(["number", "tracking_token", "idempotency_key"]),
    );
  });

  test("orders carry a version column for optimistic concurrency", () => {
    const version = config("orders").columns.find((c) => c.name === "version");

    expect(version?.notNull).toBe(true);
    expect(version?.default).toBe(1);
  });

  test("order items record copied prices and the applied promotion", () => {
    const names = config("order_item").columns.map((c) => c.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "original_base_price_rs",
        "unit_base_price_rs",
        "promotion_id",
        "line_total_rs",
      ]),
    );
  });

  test("product minimum quantity is optional and range-checked", () => {
    const product = config("product");
    const minQuantity = product.columns.find((c) => c.name === "min_quantity");

    expect(minQuantity?.notNull).toBe(false);
    expect(minQuantity?.default).toBeUndefined();
    expect(product.checks.map((c) => c.name)).toContain("product_min_quantity_ck");
  });

  test("a customer has at most one default address", () => {
    const indexes = config("customer_address").indexes.map((i) => i.config);
    const defaultIndex = indexes.find((i) => i.name === "customer_address_default_uq");

    expect(defaultIndex?.unique).toBe(true);
    expect(defaultIndex?.where).toBeDefined();
  });

  test("settings is a singleton guarded by a check constraint", () => {
    const checks = config("settings").checks.map((c) => c.name);

    expect(checks).toContain("settings_singleton_ck");
  });
});

describe("order_event is an append-only log (S-018 AC3, FR-045)", () => {
  test("the actor check ties actor type admin to an admin id, both ways", () => {
    const event = config("order_event");
    const check = event.checks.find((c) => c.name === "order_event_actor_ck");

    expect(check).toBeDefined();
    expect(event.foreignKeys.map((fk) => fk.reference().foreignTable)).toContain(schema.admin);
  });
});
