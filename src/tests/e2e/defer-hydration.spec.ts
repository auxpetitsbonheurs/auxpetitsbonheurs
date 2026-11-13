// S-276 AC7 (Owner decision 2026-11-13): browsing pages start their JavaScript after the load event
// and an idle moment, so it never shares bandwidth with the LCP photo. Until then every link, the
// Add to basket form, the language switch and the phone menu work as plain navigations and posts.
// Admin pages and form pages keep their JavaScript at once.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { SAMPLE_PHOTO } from "../../app/db/sample-data";
import { type Page, expect, test } from "./support/fixtures";

const isLaptop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** A cake of this test alone with one required size group. */
async function cake(db: postgres.Sql) {
  const tag = randomUUID().slice(0, 8);
  const slug = `e2e-defer-${tag}`;
  const [product] = await db<{ id: string }[]>`
    insert into product (slug, type, name_en, base_price_rs) values (${slug}, 'cake', ${`Defer cake ${tag}`}, 1200) returning id`;
  await db`insert into product_photo (product_id, storage_path, width, height, sort_order) values (${product!.id}, ${SAMPLE_PHOTO.storagePath}, ${SAMPLE_PHOTO.width}, ${SAMPLE_PHOTO.height}, 0)`;
  const [group] = await db<{ id: string }[]>`
    insert into option_group (product_id, name_en, name_fr, kind, required, sort_order) values (${product!.id}, 'Size', 'Taille', 'single', true, 0) returning id`;
  await db`insert into option_choice (group_id, name_en, price_delta_rs, sort_order) values (${group!.id}, '8 inch (15–20 people)', 600, 0)`;
  return { name: `Defer cake ${tag}`, path: `/menu/${slug}` };
}

test.describe("the document (S-276 AC7)", () => {
  test("a browsing page holds its module script and preloads back; admin and form pages do not", async ({ request }) => {
    for (const path of ["/", "/menu", "/fr", "/gallery"]) {
      const html = await (await request.get(path)).text();
      expect(html, path).toContain("data-apb-deferred");
      expect(html, path).not.toMatch(/<link[^>]*rel="modulepreload"/);
      expect(html, path).not.toMatch(/<script[^>]*type="module"/);
    }
    for (const path of ["/basket", "/contact", "/admin/login"]) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toContain("data-apb-deferred");
      expect(html, path).toMatch(/<script[^>]*type="module"/);
    }
  });
});

test.describe("with JavaScript, a tap before hydration still works", () => {
  test("the language switch is a plain navigation while the scripts are held up, then the page hydrates", async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    // Hold every script back, as a slow connection would: hydration cannot have happened yet.
    await page.route("**/assets/*.js", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-hydrated", "true");

    await page.getByRole("link", { name: "Français" }).click();
    await expect(page).toHaveURL(/\/fr\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    release();
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 20_000 });
  });

  test("a size picked and a message typed before hydration are still there, and Add works, after it", async ({ page, db }) => {
    const product = await cake(db);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/assets/*.js", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(product.path);
    await page.getByRole("radio", { name: /8 inch/ }).check();
    await page.getByLabel("Message on the cake").fill("Happy birthday");

    release();
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 20_000 });

    await expect(page.getByRole("radio", { name: /8 inch/ })).toBeChecked();
    await expect(page.getByLabel("Message on the cake")).toHaveValue("Happy birthday");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
  });

  test("with only the ordering area's chunk held after the page hydrated, a size and message chosen meanwhile are kept and Add works in the page", async ({ page, db }) => {
    const product = await cake(db);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    // A slow network for the ordering area's own chunk only (the readiness gap of a slow phone).
    await page.route(/\/assets\/order-form-[^/]+\.js$/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(product.path);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 20_000 });

    await page.getByRole("radio", { name: /8 inch/ }).check();
    await page.getByLabel("Message on the cake").fill("Joyeux anniversaire");
    release();

    // Once the form hydrates it adopts what is in the plain form: the live price follows the size.
    await expect(page.getByTestId("live-price")).toHaveText("Rs 1,800", { timeout: 20_000 });
    await expect(page.getByRole("radio", { name: /8 inch/ })).toBeChecked();
    await expect(page.getByLabel("Message on the cake")).toHaveValue("Joyeux anniversaire");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${product.path}$`));
  });

  test("no script is requested before the page has loaded; the page hydrates after load", async ({ page }) => {
    const scriptsBeforeLoad: string[] = [];
    let loaded = false;
    page.on("request", (request) => {
      if (!loaded && request.url().includes("/assets/") && request.url().endsWith(".js")) scriptsBeforeLoad.push(request.url());
    });
    page.on("load", () => (loaded = true));
    await page.goto("/menu");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 20_000 });
    expect(scriptsBeforeLoad).toEqual([]);
  });
});

test.describe("without JavaScript (S-276 AC7)", () => {
  test.use({ javaScriptEnabled: false });

  test("Home, the menu, a product page and the language switch are plain links; Add to basket is a form post", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/menu");
    await page.getByRole("link", { name: new RegExp(product.name) }).first().click();
    await expect(page).toHaveURL(product.path);

    await page.getByRole("link", { name: "Français" }).click();
    await expect(page).toHaveURL(`/fr${product.path}`);
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(product.path);

    await page.getByRole("radio", { name: /8 inch/ }).check();
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByText("8 inch (15–20 people)")).toBeVisible();
  });

  test("on a phone the Menu control is a link to the page with the seven links", async ({ page }) => {
    test.skip(isLaptop(page), "phone widths only");
    await page.goto("/");
    await page.getByRole("link", { name: "Menu", exact: true }).click();
    await expect(page).toHaveURL(/\/menu-links$/);
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(7);
  });
});
