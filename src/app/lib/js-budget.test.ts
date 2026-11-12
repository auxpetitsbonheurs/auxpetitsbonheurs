import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  type RouteManifest,
  checkBudgets,
  readBudgetKb,
  routeInitialChunks,
} from "./js-budget";

const manifest: RouteManifest = {
  entry: { module: "/assets/entry.js", imports: ["/assets/runtime.js"] },
  routes: {
    root: { id: "root", module: "/assets/root.js", imports: ["/assets/runtime.js"] },
    "routes/home": {
      id: "routes/home",
      parentId: "root",
      module: "/assets/home.js",
      imports: ["/assets/runtime.js", "/assets/shared.js"],
    },
    "routes/admin": { id: "routes/admin", parentId: "root", module: "/assets/admin.js" },
    "routes/admin.orders": {
      id: "routes/admin.orders",
      parentId: "routes/admin",
      module: "/assets/orders.js",
    },
  },
};

describe("routeInitialChunks", () => {
  test("a route loads the entry, its ancestors and itself, each chunk once", () => {
    const routes = routeInitialChunks(manifest);
    const home = routes.find((r) => r.route === "routes/home");

    expect(home?.chunks).toEqual([
      "/assets/entry.js",
      "/assets/runtime.js",
      "/assets/root.js",
      "/assets/home.js",
      "/assets/shared.js",
    ]);
  });

  test("only leaf routes are reported, with nested parents included", () => {
    const routes = routeInitialChunks(manifest);

    expect(routes.map((r) => r.route)).toEqual(["routes/home", "routes/admin.orders"]);
    expect(routes[1]?.chunks).toEqual([
      "/assets/entry.js",
      "/assets/runtime.js",
      "/assets/root.js",
      "/assets/admin.js",
      "/assets/orders.js",
    ]);
  });
});

describe("checkBudgets", () => {
  test("fails and names the route and its size when one route is over the limit", () => {
    const result = checkBudgets(
      [
        { route: "routes/home", gzipBytes: 120_000 },
        { route: "routes/admin.orders", gzipBytes: 171_500 },
      ],
      170,
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.route)).toEqual(["routes/admin.orders"]);
    expect(result.report).toContain("routes/admin.orders");
    expect(result.report).toContain("171.5 kB");
    expect(result.report).toMatch(/FAIL/);
  });

  test("passes when every route is at or under the limit", () => {
    const result = checkBudgets(
      [
        { route: "routes/home", gzipBytes: 170_000 },
        { route: "routes/admin.orders", gzipBytes: 90_000 },
      ],
      170,
    );

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("the limit is applied as given, so a changed budget changes the verdict", () => {
    const routes = [{ route: "routes/home", gzipBytes: 150_000 }];

    expect(checkBudgets(routes, 170).ok).toBe(true);
    expect(checkBudgets(routes, 140).ok).toBe(false);
  });
});

describe("readBudgetKb", () => {
  const yaml = (kb: string) => `project:
  name: x
budgets:
  lighthouse:
    performance: 90
  js_initial_kb: ${kb}      # gzipped JS on first load per route
  image_max_kb: 300
`;

  test("reads budgets.js_initial_kb from project.yaml text", () => {
    expect(readBudgetKb(yaml("170"))).toBe(170);
    expect(readBudgetKb(yaml("95"))).toBe(95);
  });

  test("ignores a js_initial_kb key outside budgets", () => {
    const text = `other:\n  js_initial_kb: 1\n${yaml("170")}`;

    expect(readBudgetKb(text)).toBe(170);
  });

  test("throws when the budget is missing or not a positive number", () => {
    expect(() => readBudgetKb("budgets:\n  image_max_kb: 300\n")).toThrow(/js_initial_kb/);
    expect(() => readBudgetKb(yaml("lots"))).toThrow(/js_initial_kb/);
  });
});

describe("photo compression stays out of the editor's initial JavaScript (S-047 AC8)", () => {
  // The editor's modules may only reach image-compress and heic-to through `import()`, so the
  // build puts them in chunks loaded when the first photo is chosen (the e2e spec checks the
  // network too). A static import anywhere on that path would pull them into the route chunk.
  const files = ["../routes/admin/product.tsx", "../components/admin/photo-manager.tsx", "../components/admin/use-photo-uploads.ts", "./photo-upload.ts", "./use-drag-sort.ts"];

  test.each(files)("%s imports image-compress and heic-to only dynamically (or as types)", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const staticImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gms)].map((m) => m[1]);

    expect(staticImports).not.toContain("~/lib/image-compress");
    expect(staticImports).not.toContain("./image-compress");
    expect(staticImports).not.toContain("heic-to");
  });
});
