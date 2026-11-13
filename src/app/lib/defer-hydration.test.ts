// Customer pages start their JavaScript after the load event and an idle moment (S-276 AC7;
// Owner decision 2026-11-13). The server rewrites the document stream: the module script and its
// modulepreloads wait for a tiny loader, so none of their bytes share the LCP photo's bandwidth.
import { afterEach, describe, expect, test, vi } from "vitest";
import { LOAD_CAP_MS } from "./after-load";
import { DEFER_MARKER, HYDRATION_LOADER, createDeferScriptsTransform, deferScripts, shouldDeferHydration } from "./defer-hydration";

const PAGE = [
  '<!DOCTYPE html><html><head><title>x</title></head><body><main><a href="/menu">Menu</a></main>',
  '<link rel="modulepreload" href="/assets/entry.client-abc.js"/>',
  '<link rel="modulepreload" href="/assets/chunk-def.js"/>',
  "<script>window.__reactRouterContext = {};</script>",
  '<script type="module" async="">import "/assets/manifest-1.js";\nimport("/assets/entry.client-abc.js");</script>',
  "</body></html>",
].join("");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shouldDeferHydration (which pages wait)", () => {
  test.each([
    [["root", "site-en", "home-en"]],
    [["root", "site-fr", "menu-fr"]],
    [["root", "site-en", "product-en"]],
    [["root", "site-en", "gallery-en"]],
    [["root", "site-en", "menu-links-en"]],
  ])("browsing pages defer: %j", (ids) => expect(shouldDeferHydration(ids)).toBe(true));

  test.each([
    [["root", "routes/admin/layout"]],
    [["root", "admin-product"]],
    [["root", "site-en", "basket-en"]],
    [["root", "site-en", "contact-en"]],
    [["root", "site-fr", "custom-cake-fr"]],
    [["root", "site-en", "order-confirmed-en"]],
    [["root", "site-en", "tracking-en"]],
    [["root", "site-en", "home-en", "unknown"]],
    [["root"]],
    [[]],
  ])("admin, forms and unknown matches keep their JavaScript at once: %j", (ids) => expect(shouldDeferHydration(ids)).toBe(false));
});

describe("deferScripts", () => {
  test("modulepreloads wait (rel changes) and the module script becomes inert text", () => {
    const out = deferScripts(PAGE);
    expect(out).not.toMatch(/<link[^>]*rel="modulepreload"/);
    expect(out).toContain('<link rel="x-modulepreload" href="/assets/entry.client-abc.js"/>');
    expect(out).not.toMatch(/<script[^>]*type="module"/);
    expect(out).toContain(`<script type="text/plain" ${DEFER_MARKER}="">import "/assets/manifest-1.js";`);
  });

  test("the context script stays executable and the loader comes last, before the end of the body", () => {
    const out = deferScripts(PAGE);
    expect(out).toContain("<script>window.__reactRouterContext = {};</script>");
    expect(out.endsWith(`<script>${HYDRATION_LOADER}</script></body></html>`)).toBe(true);
  });

  test("a page without a module script (a redirect body, an error page) is left alone", () => {
    const html = "<html><body><p>Oops</p></body></html>";
    expect(deferScripts(html)).toBe(html);
  });
});

describe("the stream", () => {
  async function run(chunks: Uint8Array[]): Promise<string> {
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    return new Response(input.pipeThrough(createDeferScriptsTransform())).text();
  }
  const slices = (bytes: Uint8Array, size: number) => Array.from({ length: Math.ceil(bytes.length / size) }, (_, i) => bytes.slice(i * size, (i + 1) * size));

  test("gives the same result as the whole page, wherever the chunks are cut (inside a tag too)", async () => {
    const whole = deferScripts(PAGE);
    const bytes = new TextEncoder().encode(PAGE);
    for (const size of [1, 3, 7, 16, 50, 200, bytes.length]) {
      expect(await run(slices(bytes, size))).toBe(whole);
    }
  });

  test("keeps a multi-byte character cut between two chunks", async () => {
    const bytes = new TextEncoder().encode("<body><p>Crème brûlée 🎂</p></body>");
    expect(await run(slices(bytes, 1))).toContain("Crème brûlée 🎂");
  });

  test("an unfinished tag at the very end is still sent", async () => {
    expect(await run([new TextEncoder().encode("<p>hi</p><di")])).toBe("<p>hi</p><di");
  });
});

describe("the loader (runs in the browser)", () => {
  function stubBrowser(readyState: DocumentReadyState) {
    const placeholder = { textContent: 'import("/assets/entry.client.js");' };
    const preload = { rel: "x-modulepreload" };
    const appended: Array<{ type?: string; textContent?: string }> = [];
    const events = new Map<string, () => void>();
    const idleCallbacks: Array<() => void> = [];
    const addEventListener = (name: string, fn: () => void) => events.set(name, fn);
    const requestIdleCallback = (fn: () => void) => idleCallbacks.push(fn);
    vi.stubGlobal("document", {
      readyState,
      querySelector: (selector: string) => (selector.includes(DEFER_MARKER) ? placeholder : null),
      querySelectorAll: () => [preload],
      createElement: () => ({}) as { type?: string; textContent?: string },
      body: { appendChild: (node: { type?: string; textContent?: string }) => appended.push(node) },
    });
    vi.stubGlobal("window", { requestIdleCallback });
    vi.stubGlobal("addEventListener", addEventListener);
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    return { appended, events, idleCallbacks, preload };
  }
  const startLoader = () => new Function(HYDRATION_LOADER)();

  test("starts the module script only after the load event and an idle moment, once", () => {
    vi.useFakeTimers();
    const browser = stubBrowser("loading");
    startLoader();
    expect(browser.appended).toHaveLength(0);
    browser.events.get("load")?.();
    expect(browser.appended).toHaveLength(0);
    browser.idleCallbacks[0]?.();
    expect(browser.appended).toHaveLength(1);
    expect(browser.appended[0]).toMatchObject({ type: "module", textContent: 'import("/assets/entry.client.js");' });
    expect(browser.preload.rel).toBe("modulepreload");
    vi.advanceTimersByTime(LOAD_CAP_MS + 1000);
    expect(browser.appended).toHaveLength(1);
  });

  test("a page whose load event never comes still starts after the cap", () => {
    vi.useFakeTimers();
    const browser = stubBrowser("loading");
    startLoader();
    vi.advanceTimersByTime(LOAD_CAP_MS - 1);
    expect(browser.appended).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(browser.appended).toHaveLength(1);
  });

  test("an already loaded page only waits for idle", () => {
    vi.useFakeTimers();
    const browser = stubBrowser("complete");
    startLoader();
    expect(browser.appended).toHaveLength(0);
    browser.idleCallbacks[0]?.();
    expect(browser.appended).toHaveLength(1);
  });
});
