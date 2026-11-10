// Accessibility assertions shared by every spec (S-005 AC2, AC3).
import AxeBuilder from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

const FAILING_IMPACTS = new Set(["serious", "critical"]);

export interface A11yOptions {
  /** 2 = 200% zoom, emulated by halving the CSS viewport as browser zoom does. */
  zoom?: number;
}

/** Fails when the document scrolls sideways. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal scroll: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(
    clientWidth,
  );
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const failing = results.violations.filter((v) => FAILING_IMPACTS.has(v.impact ?? ""));
  const report = failing
    .flatMap((v) => v.nodes.map((n) => `[${v.impact}] ${v.id}: ${v.help}\n    at ${n.target.join(" ")}`))
    .join("\n");
  expect(failing, `axe found serious/critical violations:\n${report}`).toEqual([]);
}

/**
 * Runs axe (serious and critical fail, printing rule and element). With `{ zoom: 2 }`
 * it first sets 200% zoom and also asserts there is no horizontal scroll; the
 * original viewport is restored afterwards.
 */
export async function expectNoA11yViolations(page: Page, options: A11yOptions = {}) {
  const zoom = options.zoom ?? 1;
  const original = page.viewportSize();
  if (zoom !== 1 && original) {
    await page.setViewportSize({
      width: Math.floor(original.width / zoom),
      height: Math.floor(original.height / zoom),
    });
  }
  try {
    await scan(page);
    if (zoom !== 1) await expectNoHorizontalScroll(page);
  } finally {
    if (zoom !== 1 && original) await page.setViewportSize(original);
  }
}
