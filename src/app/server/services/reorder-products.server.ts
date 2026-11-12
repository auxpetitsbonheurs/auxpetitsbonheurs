// `admin/menu` reorder (S-042, FR-061): the products of one type in the posted order. The
// posted ids must be exactly that type's products (none added or removed meanwhile, no
// repeats), else VALIDATION_FAILED "The menu changed, reload" and nothing changes. Other
// types keep their order. One statement writes every position; the customer menu (and the
// cached menu's content hash) follows `sort_order`.
import { eq, sql } from "drizzle-orm";
import { product } from "~/db/schema";
import type { ProductType } from "~/domain/product";
import type { Database } from "~/server/db.server";

export type ReorderResult = { ok: true; type: ProductType; ids: string[] } | { ok: false; code: "VALIDATION_FAILED" };

export async function reorderProducts(db: Database, type: ProductType, ids: readonly string[]): Promise<ReorderResult> {
  const posted = ids.map((id) => id.toLowerCase());
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: product.id }).from(product).where(eq(product.type, type)).for("update");
    const current = new Set(rows.map((r) => r.id));
    const exact = posted.length === current.size && new Set(posted).size === posted.length && posted.every((id) => current.has(id));
    if (!exact) return { ok: false, code: "VALIDATION_FAILED" } as const;
    if (posted.length > 0) {
      await tx.execute(sql`
        update ${product} set sort_order = x.ord - 1
        from unnest(${sql.raw("ARRAY[")}${sql.join(posted.map((id) => sql`${id}`), sql`, `)}${sql.raw("]::uuid[]")}) with ordinality as x(id, ord)
        where ${product.id} = x.id and ${product.sortOrder} <> x.ord - 1`);
    }
    return { ok: true, type, ids: posted };
  });
}
