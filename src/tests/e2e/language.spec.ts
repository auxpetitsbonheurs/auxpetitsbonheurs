import { readFileSync } from "node:fs";
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { expect, test } from "./support/fixtures";

type Tree = { [key: string]: string | Tree };

const catalogue = (locale: string): Tree =>
  JSON.parse(readFileSync(new URL(`../../app/i18n/${locale}.json`, import.meta.url), "utf8")) as Tree;
const en = catalogue("en");
const fr = catalogue("fr");

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
}

const english = new Map(leaves(en));
/** French sentences that differ from the English and are long enough to be unambiguous. */
const frenchOnly = leaves(fr)
  .filter(([key, value]) => value !== english.get(key) && value.length >= 12)
  .map(([, value]) => value);

test.describe("only the active locale ships (S-006 AC5)", () => {
  test("an English page's HTML and JavaScript contain no French-only text", async ({ page, request }) => {
    const scripts = new Set<string>();
    page.on("response", (response) => {
      if (response.request().resourceType() === "script") scripts.add(response.url());
    });
    const html = await (await request.get("/")).text();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(english.get("home.title")!);

    expect(frenchOnly.length).toBeGreaterThan(5);
    expect(scripts.size).toBeGreaterThan(0);
    const bodies = [html, ...(await Promise.all([...scripts].map(async (url) => (await request.get(url)).text())))];
    for (const body of bodies) {
      for (const sentence of frenchOnly) expect(body).not.toContain(sentence);
    }
  });
});

test("S-006 AC5 control: a French page does carry the French text", async ({ request }) => {
  const html = await (await request.get("/fr/")).text();

  expect(html).toContain((fr.home as Tree).title as string);
});

const ONE_YEAR_S = 365 * 24 * 60 * 60;

test.describe("first visit with a French browser (S-008 AC1)", () => {
  test.use({ locale: "fr-FR" });

  test("/ redirects to /fr/ and renders French", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/fr\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText((fr.home as Tree).title as string);
  });

  test("AC3: the cookie apb_locale=en wins over the browser language", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "apb_locale", value: "en", url: baseURL! }]);

    await page.goto("/");

    await expect(page).toHaveURL(`${baseURL}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("AC4: an invalid cookie is ignored, so detection applies", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "apb_locale", value: "it", url: baseURL! }]);

    await page.goto("/");

    await expect(page).toHaveURL(/\/fr\/$/);
  });
});

test.describe("first visit with an English browser (S-008 AC1)", () => {
  test.use({ locale: "en-GB" });

  test("/ stays in English", async ({ page, baseURL }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(`${baseURL}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test("S-008 AC4: an unknown prefix /it/ is a 404", async ({ request }) => {
  const response = await request.get("/it/", { maxRedirects: 0 });

  expect(response.status()).toBe(404);
});

test("S-008 AC2: the switch keeps the page and query and remembers English for a year", async ({ page, context }) => {
  await page.goto("/fr/basket?x=1");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.getByRole("link", { name: "English" }).click();

  await expect(page).toHaveURL(/\/basket\?x=1$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const cookie = (await context.cookies()).find((c) => c.name === "apb_locale");
  expect(cookie?.value).toBe("en");
  expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(ONE_YEAR_S - 3600);
  expect(cookie!.expires - Date.now() / 1000).toBeLessThanOrEqual(ONE_YEAR_S + 60);
});

test.describe("hreflang and lang (S-008 AC5)", () => {
  for (const [path, lang] of [
    ["/", "en"],
    ["/fr/", "fr"],
    ["/fr/basket?x=1", "fr"],
  ] as const) {
    test(`${path} has lang=${lang} and EN/FR alternates`, async ({ page, baseURL }) => {
      await page.goto(path);
      const twin = path.replace(/^\/fr/, "").replace(/\?.*$/, "") || "/";

      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", `${baseURL}${twin}`);
      await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveAttribute("href", `${baseURL}/fr${twin}`);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", `${baseURL}${twin}`);
    });
  }
});

test.describe("the switch (S-008 AC6, AC7)", () => {
  for (const [path, name, lang, href] of [
    ["/", "Français", "fr", "/fr/"],
    ["/fr/", "English", "en", "/"],
  ] as const) {
    test(`on ${path} it is a ${name} link with lang=${lang}, 44 px tall, keyboard reachable`, async ({ page }) => {
      await page.goto(path);
      const link = page.getByRole("link", { name, exact: true });

      await expect(link).toHaveAttribute("lang", lang);
      await expect(link).toHaveAttribute("hreflang", lang);
      await expect(link).toHaveAttribute("href", href);
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectKeyboardOperable(page);
    });

    test(`on ${path} nothing is clipped and colours pass, at 100% and 200% zoom`, async ({ page }) => {
      await page.goto(path);

      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
        });
      }
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }

  test("French page labels the basket in French", async ({ page, baseURL }) => {
    await page.context().addCookies([
      {
        name: "apb_basket",
        value: encodeURIComponent(
          JSON.stringify([{ lineId: "fr", productId: "00000000-0000-4000-8000-000000000001", options: [], quantity: 2 }]),
        ),
        url: baseURL!,
      },
    ]);
    await page.goto("/fr/");

    await expect(page.getByRole("link", { name: "Panier, 2 articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Aller au contenu principal" })).toBeAttached();
  });
});
