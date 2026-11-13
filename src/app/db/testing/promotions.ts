// Test data builder for promotions (unit tests on PGlite only).
import type { TestDatabase } from "./pglite";

export interface PromotionSeed {
  title?: string;
  starts: string;
  ends: string;
  active?: boolean;
  placement?: "banner" | "card" | "both";
  linkKind?: "none" | "product" | "category" | "custom_request";
  linkProductId?: string;
  linkCategory?: string;
  discounts?: { productId: string; percentOff?: number; salePriceRs?: number }[];
}

/** Inserts a promotion ("<title> (fr)" in French, text "Ten percent off") and its discounts; returns its id. */
export async function insertPromotion(db: TestDatabase, values: PromotionSeed): Promise<string> {
  const title = values.title ?? "Offer";
  const { rows } = await db.client.query<{ id: string }>(
    "insert into promotion (title_en, title_fr, text_en, starts_at, ends_at, active, placement, link_kind, link_product_id, link_category) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id",
    [title, `${title} (fr)`, "Ten percent off", values.starts, values.ends, values.active ?? true, values.placement ?? "both", values.linkKind ?? "none", values.linkProductId ?? null, values.linkCategory ?? null],
  );
  const id = rows[0]!.id;
  for (const d of values.discounts ?? []) {
    await db.client.query("insert into promotion_product (promotion_id, product_id, discount_kind, percent_off, sale_price_rs) values ($1, $2, $3, $4, $5)", [
      id, d.productId, d.percentOff === undefined ? "sale_price" : "percent", d.percentOff ?? null, d.salePriceRs ?? null,
    ]);
  }
  return id;
}
