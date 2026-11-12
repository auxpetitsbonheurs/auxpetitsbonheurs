// S-035 AC1, AC2, AC6: the admin manifest and service worker routes: public, no admin data,
// the right scope, display, colours from tokens.json, icons on disk, and `no-cache` on sw.js.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ADMIN_THEME } from "~/lib/admin-manifest";
import { SERVICE_WORKER_SOURCE } from "~/lib/sw-handlers";
import { ADMIN_MODULE_POLICY } from "~/server/admin-policy.server";
import { loader as manifestLoader } from "./manifest";
import { loader as swLoader } from "./sw";

const root = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const tokens = JSON.parse(readFileSync(root("../docs/design/tokens.json"), "utf8")) as {
  color: Record<string, { $extensions: { mode: { light: string; dark: string } } }>;
};

describe("/admin/manifest.webmanifest", () => {
  test("AC1: scope /admin/, start URL inside it, standalone, the bakery's name, icons 192, 512 and maskable", async () => {
    const response = manifestLoader();
    const manifest = (await response.json()) as Record<string, unknown> & { icons: { src: string; sizes: string; purpose: string }[] };

    expect(response.headers.get("Content-Type")).toMatch(/^application\/manifest\+json/);
    expect(manifest).toMatchObject({ scope: "/admin/", start_url: "/admin/", display: "standalone", name: "Aux petits bonheurs" });
    expect((manifest.start_url as string).startsWith(manifest.scope as string)).toBe(true);
    expect(manifest.icons.map((icon) => [icon.sizes, icon.purpose])).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
    for (const icon of manifest.icons) expect(existsSync(root(`public${icon.src}`)), icon.src).toBe(true);
  });

  test("AC1: theme colours are the tokens' surface and background", async () => {
    const manifest = (await manifestLoader().json()) as { theme_color: string; background_color: string };

    expect(manifest.theme_color).toBe(tokens.color.surface!.$extensions.mode.light);
    expect(manifest.background_color).toBe(tokens.color.bg!.$extensions.mode.light);
    expect(ADMIN_THEME.dark).toEqual({ surface: tokens.color.surface!.$extensions.mode.dark, bg: tokens.color.bg!.$extensions.mode.dark });
  });
});

describe("/admin/sw.js", () => {
  test("AC2: served as JavaScript with Cache-Control no-cache and an /admin/ scope", async () => {
    const response = swLoader();

    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Content-Type")).toMatch(/^text\/javascript/);
    expect(response.headers.get("Service-Worker-Allowed")).toBe("/admin/");
    expect(await response.text()).toBe(SERVICE_WORKER_SOURCE);
  });
});

describe("AC6: public, with nothing private", () => {
  test("both are public modules (no session needed, no loader argument read)", () => {
    expect(ADMIN_MODULE_POLICY.manifest).toBe("public");
    expect(ADMIN_MODULE_POLICY.sw).toBe("public");
    expect(manifestLoader.length).toBe(0);
    expect(swLoader.length).toBe(0);
  });

  test("no secret-looking or personal content", async () => {
    const text = `${await manifestLoader().text()}\n${await swLoader().text()}`;

    expect(text).not.toMatch(/@|key|token|secret|supabase|password/i);
  });
});
