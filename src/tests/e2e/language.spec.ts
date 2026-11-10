import { readFileSync } from "node:fs";
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
