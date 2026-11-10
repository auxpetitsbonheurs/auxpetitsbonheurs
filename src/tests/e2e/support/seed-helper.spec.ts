import { E2E_OWNER, SAMPLE_PRODUCT, createOrder } from "./database";
import { expect, test } from "./fixtures";

test.describe("e2e database helper (AC4)", () => {
  test("the reset database holds the sample product and exactly one Owner", async ({ db }) => {
    const products = await db`select slug, base_price_rs from product where slug = ${SAMPLE_PRODUCT.slug}`;
    const owners = await db`select email from admin where role = 'owner'`;

    expect(products).toEqual([{ slug: SAMPLE_PRODUCT.slug, base_price_rs: SAMPLE_PRODUCT.basePriceRs }]);
    expect(owners).toEqual([{ email: E2E_OWNER.email }]);
  });

  test.describe.configure({ mode: "parallel" });

  for (const label of ["spec A", "spec B", "spec C"]) {
    test(`${label} creates its own order without clashing`, async ({ db }, testInfo) => {
      const name = `${label} ${testInfo.project.name} ${testInfo.workerIndex}`;
      const created = await Promise.all([createOrder(db, name), createOrder(db, name)]);

      const mine = await db`
        select o.number from orders o join customer c on c.id = o.customer_id
        where c.id in ${db(created.map((o) => o.customerId))} order by o.number`;

      expect(mine).toHaveLength(2);
      expect(new Set(created.map((o) => o.number)).size).toBe(2);
    });
  }
});
