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

/** Runs `check` at `zoom` (e.g. 2 = 200%) by shrinking the CSS viewport, then restores it. */
export async function withZoom<T>(page: Page, zoom: number, check: () => Promise<T>): Promise<T> {
  const original = page.viewportSize();
  if (zoom === 1 || !original) return check();
  await page.setViewportSize({
    width: Math.floor(original.width / zoom),
    height: Math.floor(original.height / zoom),
  });
  try {
    return await check();
  } finally {
    await page.setViewportSize(original);
  }
}

/**
 * Runs axe (serious and critical fail, printing rule and element). With `{ zoom: 2 }`
 * it first sets 200% zoom and also asserts there is no horizontal scroll; the
 * original viewport is restored afterwards.
 */
export async function expectNoA11yViolations(page: Page, options: A11yOptions = {}) {
  const zoom = options.zoom ?? 1;
  await withZoom(page, zoom, async () => {
    await scan(page);
    if (zoom !== 1) await expectNoHorizontalScroll(page);
  });
}

const INTERACTIVE =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Every rendered interactive element is at least `min` x `min` CSS px (visually hidden ones excepted). */
export async function expectTapTargets(page: Page, min = 44) {
  const small = await page.evaluate(
    ({ selector, min }) =>
      [...document.querySelectorAll<HTMLElement>(selector)].flatMap((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return []; // visually hidden until focused (skip link)
        if (r.width >= min - 0.5 && r.height >= min - 0.5) return [];
        const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
        return [`<${el.tagName.toLowerCase()}> "${name}" is ${Math.round(r.width)}x${Math.round(r.height)}`];
      }),
    { selector: INTERACTIVE, min },
  );
  expect(small, `tap targets under ${min}px:\n${small.join("\n")}`).toEqual([]);
}

/** No element cuts its content off (overflow hidden/clip or ellipsis) and no control sticks out sideways. */
export async function expectNothingClipped(page: Page) {
  const clipped = await page.evaluate((selector) => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const s = getComputedStyle(el);
      if (el.clientWidth <= 1) continue; // visually hidden by design
      const hides = ["hidden", "clip"].includes(s.overflowX) || s.textOverflow === "ellipsis";
      if (hides && el.scrollWidth > el.clientWidth + 1) out.push(`<${el.tagName.toLowerCase()}> clips its content`);
    }
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && (r.left < -0.5 || r.right > width + 0.5)) {
        out.push(`<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 30)}" is outside the viewport`);
      }
    }
    return out;
  }, INTERACTIVE);
  expect(clipped, clipped.join("\n")).toEqual([]);
}

export interface FocusStop {
  index: number;
  name: string;
  visibleFocus: boolean;
}

/**
 * Presses Tab from the top of the page until focus leaves the document or wraps,
 * returning each stop's position among the page's focusable elements (DOM order)
 * and whether it shows a focus indicator (outline or box-shadow).
 */
export async function tabThrough(page: Page, limit = 60): Promise<{ stops: FocusStop[]; total: number }> {
  // Start from the top of the page: Chromium otherwise starts sequential navigation
  // from the last click, so a focused, unlisted (tabindex=-1) marker is put first.
  await page.evaluate(() => {
    const marker = document.createElement("span");
    marker.tabIndex = -1;
    marker.dataset.tabStart = "";
    document.body.insertBefore(marker, document.body.firstChild);
    marker.focus();
  });
  const stops: FocusStop[] = [];
  let total = 0;
  try {
    for (let i = 0; i < limit; i += 1) {
      await page.keyboard.press("Tab");
      const stop = await tabStop(page);
      total = stop.total;
      if (!stop.stop || (stops.length > 0 && stop.stop.index === stops[0]!.index)) break;
      stops.push(stop.stop);
    }
  } finally {
    await page.evaluate(() => document.querySelector("[data-tab-start]")?.remove());
  }
  return { stops, total };
}

/**
 * The focused element's position among the page's Tab stops. A radio group is one
 * stop (its checked radio, or its first radio when none is checked); arrow keys move
 * inside it, as in every browser.
 */
async function tabStop(page: Page) {
  return page.evaluate((selector) => {
    const isTabStop = (el: HTMLElement) => {
      if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name) return true;
      const group = [...(el.form ?? document).querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`)];
      const checked = group.find((radio) => radio.checked);
      return checked ? checked === el : group[0] === el;
    };
    const all = [...document.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.getClientRects().length > 0 && isTabStop(el),
    );
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { total: all.length, stop: null };
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== "none" && Number.parseFloat(s.outlineWidth) >= 2;
    const shadow = s.boxShadow !== "none";
    const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
    return { total: all.length, stop: { index: all.indexOf(el), name, visibleFocus: outline || shadow } };
  }, INTERACTIVE);
}

/** Keyboard reaches every control once, in DOM order, each with a visible focus indicator. */
export async function expectKeyboardOperable(page: Page) {
  const { stops, total } = await tabThrough(page);
  expect(stops.map((s) => s.index), "focus order follows the page order").toEqual([...Array(total).keys()]);
  const invisible = stops.filter((s) => !s.visibleFocus).map((s) => s.name);
  expect(invisible, "controls without a visible focus indicator").toEqual([]);
}
