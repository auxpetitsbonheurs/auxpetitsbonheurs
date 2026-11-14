// One status wording on every admin screen (E-06, coordinator 2026-11-14): admin pages show
// `admin.status.*` ("Quote needed"), customers see `order.status.*` ("Waiting for our quote").
// Every StatusBadge under the admin app must ask for the admin wording.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import en from "~/i18n/en.json";
import fr from "~/i18n/fr.json";
import { ORDER_STATUSES } from "~/domain/status";

const APP = resolve(__dirname, "..", "..");
const ADMIN_DIRS = [join(APP, "components", "admin"), join(APP, "routes", "admin")];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".tsx") && !path.includes(".test.") ? [path] : [];
  });
}

describe("admin status wording", () => {
  test("every StatusBadge on an admin screen uses the admin labels", () => {
    const offenders = ADMIN_DIRS.flatMap(sources).flatMap((file) =>
      (readFileSync(file, "utf8").match(/<StatusBadge\b[^>]*>/g) ?? []).filter((tag) => !tag.includes('audience="admin"')).map((tag) => `${file}: ${tag}`),
    );
    expect(offenders).toEqual([]);
  });

  test.each([
    ["en", en],
    ["fr", fr],
  ] as const)("every status has an admin label in %s", (_locale, messages) => {
    const labels = (messages as { admin: { status: Record<string, string> } }).admin.status;
    for (const status of ORDER_STATUSES) expect(labels[status], status).toBeTruthy();
  });
});
