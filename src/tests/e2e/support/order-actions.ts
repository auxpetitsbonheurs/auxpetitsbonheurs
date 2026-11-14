// Where the order screen's actions must be (S-126): on a phone, in the bottom half and visible
// without scrolling (thumb reach); from 768 px up, visible without scrolling and in their own
// column beside the order, never over any of its links or buttons.
import type { Locator } from "@playwright/test";
import { type Page, expect } from "./fixtures";

export async function expectActionInReach(page: Page, action: Locator) {
  const viewport = page.viewportSize()!;
  const box = (await action.boundingBox())!;
  expect(box.y + box.height, "visible without scrolling").toBeLessThanOrEqual(viewport.height);
  if (viewport.width < 768) {
    expect(box.y, "in the bottom half on a phone").toBeGreaterThan(viewport.height / 2);
    return;
  }
  const content = (await page.getByTestId("order-content").boundingBox())!;
  const bar = (await page.locator("[data-sticky-bar]").boundingBox())!;
  expect(bar.x, "the actions sit beside the order, not over it").toBeGreaterThanOrEqual(content.x + content.width);
}
