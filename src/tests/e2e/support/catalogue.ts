// Products for admin menu specs (E-03). Each call makes its own product with a unique
// name and slug, so specs running in parallel (and at three widths) never share one.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { SAMPLE_PHOTO } from "../../../app/db/sample-data";

export interface E2eProduct {
  id: string;
  name: string;
  slug: string;
}

export interface ProductOptions {
  name?: string;
  type?: "cake" | "cupcake_box" | "dessert" | "seasonal";
  status?: "available" | "sold_out" | "hidden";
  photo?: boolean;
  /** How many photos (distinct paths to the bundled sample image); default 1, or 0 with `photo: false`. */
  photos?: number;
  priceRs?: number;
}

export async function createProduct(sql: postgres.Sql, options: ProductOptions = {}): Promise<E2eProduct> {
  const tag = randomUUID().slice(0, 8);
  const name = `${options.name ?? "Test cake"} ${tag}`;
  const slug = `e2e-${tag}`;
  const [row] = await sql<{ id: string }[]>`
    insert into product (slug, type, name_en, base_price_rs, status)
    values (${slug}, ${options.type ?? "cake"}, ${name}, ${options.priceRs ?? 850}, ${options.status ?? "available"})
    returning id`;
  const count = options.photos ?? ((options.photo ?? true) ? 1 : 0);
  for (let slot = 0; slot < count; slot++) {
    // Same bundled image, a distinct path per slot (the editor keys photos by path).
    const path = slot === 0 ? SAMPLE_PHOTO.storagePath : `${SAMPLE_PHOTO.storagePath}?slot=${slot}`;
    await sql`
      insert into product_photo (product_id, storage_path, width, height, sort_order)
      values (${row!.id}, ${path}, ${SAMPLE_PHOTO.width}, ${SAMPLE_PHOTO.height}, ${slot})`;
  }
  return { id: row!.id, name, slug };
}

/** Adds `count` pick-one groups with `choices` Rs 0 choices each to a product (S-048 limits). */
export async function addOptionGroups(sql: postgres.Sql, productId: string, count: number, choices = 1): Promise<void> {
  for (let g = 0; g < count; g++) {
    const [group] = await sql<{ id: string }[]>`
      insert into option_group (product_id, name_en, kind, required, sort_order)
      values (${productId}, ${`Group ${g + 1}`}, 'single', false, ${g}) returning id`;
    for (let c = 0; c < choices; c++) {
      await sql`insert into option_choice (group_id, name_en, price_delta_rs, sort_order) values (${group!.id}, ${`Choice ${c + 1}`}, 0, ${c})`;
    }
  }
}
