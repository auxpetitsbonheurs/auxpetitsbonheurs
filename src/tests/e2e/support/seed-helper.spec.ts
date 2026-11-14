import { E2E_DATABASE_URL, E2E_OWNER, SAMPLE_PRODUCT, connectE2eDatabase, createOrder, resetDatabase } from "./database";
import { expect, test } from "./fixtures";

test.describe("e2e database helper (AC4)", () => {
  // The shared e2e database is changed by specs running in parallel (admin-team.spec promotes a
  // throwaway Admin to Owner for a moment), so this resets a database of its own, per project.
  // Playwright requires an object pattern here, even when no fixtures are used.
  // eslint-disable-next-line no-empty-pattern
  test("the reset database holds the sample product and exactly one Owner", async ({}, testInfo) => {
    const url = E2E_DATABASE_URL.replace(/\/apb_e2e$/, `/apb_e2e_seed_${testInfo.project.name.replace(/[^a-z0-9]/g, "_")}`);
    await resetDatabase(url);
    const sql = connectE2eDatabase(url);
    try {
      const products = await sql`select slug, base_price_rs from product where slug = ${SAMPLE_PRODUCT.slug}`;
      const owners = await sql`select email from admin where role = 'owner'`;

      expect(products).toEqual([{ slug: SAMPLE_PRODUCT.slug, base_price_rs: SAMPLE_PRODUCT.basePriceRs }]);
      expect(owners).toEqual([{ email: E2E_OWNER.email }]);
    } finally {
      await sql.end();
    }
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
