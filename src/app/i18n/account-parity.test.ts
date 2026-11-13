// S-218 AC6 (and S-269 AC3 for the review text): every account, review and account-email string
// exists in English and French, non-empty, with the same {{placeholders}}.
import { describe, expect, test } from "vitest";
import en from "./en.json";
import fr from "./fr.json";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)));
}

const pick = (tree: Tree, path: string): Tree => path.split(".").reduce((node, key) => node[key] as Tree, tree);
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

const SCOPES = ["account", "reviews", "reviewForm", "admin.reviews", "email.signup", "email.magiclink", "email.customerRecovery", "basket.reorder"];

describe.each(SCOPES)("%s in EN and FR", (scope) => {
  const english = new Map(leaves(pick(en as unknown as Tree, scope)));
  const french = new Map(leaves(pick(fr as unknown as Tree, scope)));

  test("the same keys, none empty", () => {
    expect([...french.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, value] of [...english, ...french]) expect(value.trim(), key).not.toBe("");
  });

  test("the same placeholders", () => {
    for (const [key, value] of english) expect(placeholders(french.get(key) ?? ""), key).toEqual(placeholders(value));
  });
});
