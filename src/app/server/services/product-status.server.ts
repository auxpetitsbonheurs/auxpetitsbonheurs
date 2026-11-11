// `admin/menu` setStatus (S-043, FR-061): hide, show, mark sold out or available in one tap.
// Applies to the customer site at once: the product page and addToBasket read the status
// fresh, and GET /api/menu's version is a hash of its content, so the phone's cached menu
// is replaced on its next revalidation (ADR-0004) and a basket line turns "No longer available".
import { count, eq } from "drizzle-orm";
import { product, productPhoto } from "~/db/schema";
import { type ProductStatusValue, statusNeedsPhoto } from "~/domain/product";
import type { Database } from "~/server/db.server";

export type SetStatusResult =
  | { ok: true; id: string; status: ProductStatusValue }
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "VALIDATION_FAILED"; fields: { status: "photo" } };

export async function setProductStatus(
  db: Database,
  input: { id: string; status: ProductStatusValue },
  context: { adminId: string; now: Date },
): Promise<SetStatusResult> {
  return db.transaction(async (tx) => {
    const [found] = await tx.select({ id: product.id }).from(product).where(eq(product.id, input.id)).for("update");
    if (!found) return { ok: false, code: "NOT_FOUND" } as const;
    if (statusNeedsPhoto(input.status)) {
      const [photos] = await tx.select({ n: count() }).from(productPhoto).where(eq(productPhoto.productId, input.id));
      if (!photos?.n) return { ok: false, code: "VALIDATION_FAILED", fields: { status: "photo" } } as const;
    }
    await tx.update(product).set({ status: input.status, updatedAt: context.now, updatedBy: context.adminId }).where(eq(product.id, input.id));
    return { ok: true, id: input.id, status: input.status } as const;
  });
}
