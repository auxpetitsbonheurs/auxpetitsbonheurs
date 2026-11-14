// S-172 / S-227: the Top products table of the Sales summary never scrolls sideways at 200% zoom
// (the audit hit it in CI once earlier specs had left completed orders with items for today).
import { expectNoA11yViolations } from "./support/a11y";
import { signIn } from "./support/admin";
import { E2E_ACCOUNTS, SAMPLE_PRODUCT, createOrder } from "./support/database";
import { test } from "./support/fixtures";

test("top products at 200% zoom: axe clean and no sideways scroll", async ({ page, db }) => {
  const order = await createOrder(db, "Top products zoom");
  const [product] = await db<{ id: string }[]>`select id from product where slug = ${SAMPLE_PRODUCT.slug}`;
  await db`update orders set status = 'completed', fulfil_on = current_date, total_rs = 123456, items_total_rs = 123456, paid = true where id = ${order.id}`;
  await db`insert into order_item (order_id, product_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, options, quantity, line_total_rs, sort_order)
    values (${order.id}, ${product!.id}, 'Chocolate Cake', null, 850, 850, '[]', 12, 10200, 0)`;
  await signIn(page, E2E_ACCOUNTS.owner, "/admin/sales");
  await page.waitForLoadState("load");
  await expectNoA11yViolations(page);
  await expectNoA11yViolations(page, { zoom: 2 });
});
