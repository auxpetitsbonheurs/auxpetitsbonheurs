import { type Page, expect } from "./fixtures";

/**
 * The product page's Add to basket form has its JavaScript. The root's `data-hydrated` is not
 * enough: the form is a lazy chunk that can hydrate later (a slow CI runner), and a click in
 * between is a plain post that lands on the basket instead of saying "Added to your basket".
 */
export async function orderFormReady(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator("form[data-enhanced]")).toHaveCount(1);
}
