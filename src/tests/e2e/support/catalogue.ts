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
  if (options.photo ?? true) {
    await sql`
      insert into product_photo (product_id, storage_path, width, height, sort_order)
      values (${row!.id}, ${SAMPLE_PHOTO.storagePath}, ${SAMPLE_PHOTO.width}, ${SAMPLE_PHOTO.height}, 0)`;
  }
  return { id: row!.id, name, slug };
}
