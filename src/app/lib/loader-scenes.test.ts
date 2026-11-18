// S-321: the page loader shows one scene per destination page, chosen by the page being opened.
// The map is the one source of truth for React (sceneFor) and the full-page-load script
// (SCENE_FOR_SCRIPT); both must agree on every path, in English and French.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { LOADER_SCENES, SCENE_BY_SECTION, SCENE_FOR_SCRIPT, sceneFor } from "./loader-scenes";

const CASES: [string, string][] = [
  ["/", "whisk"],
  ["/fr", "whisk"],
  ["/fr/", "whisk"],
  ["/our-story", "egg"],
  ["/fr/our-story", "egg"],
  ["/menu", "sugar"],
  ["/menu/", "sugar"],
  ["/menu/chocolate-cake", "sugar"],
  ["/fr/menu", "sugar"],
  ["/fr/menu/gateau-chocolat", "sugar"],
  ["/custom-cake", "flour"],
  ["/fr/custom-cake", "flour"],
  ["/workshops", "hearts"],
  ["/workshops/macarons-saturday", "hearts"],
  ["/fr/workshops/macarons-samedi", "hearts"],
  ["/gallery", "oven"],
  ["/fr/gallery", "oven"],
  ["/contact", "cake"],
  ["/fr/contact", "cake"],
  // Everything else: the whisk.
  ["/basket", "whisk"],
  ["/fr/basket", "whisk"],
  ["/order/abc/confirmed", "whisk"],
  ["/t/abc", "whisk"],
  ["/account", "whisk"],
  ["/fr/account/orders", "whisk"],
  ["/privacy", "whisk"],
  ["/reviews", "whisk"],
  ["/menu-links", "whisk"],
  ["/about", "whisk"],
  ["/it/menu", "whisk"],
  ["/constructor", "whisk"],
  ["/__proto__", "whisk"],
  ["/fr/fr/menu", "whisk"],
];

/** The script's picking function, run as the browser would run it. */
const scriptSceneFor = new Function(`return ${SCENE_FOR_SCRIPT}`)() as (pathname: string) => string;

describe("sceneFor", () => {
  test.each(CASES)("%s → %s", (pathname, scene) => {
    expect(sceneFor(pathname)).toBe(scene);
  });
});

describe("SCENE_FOR_SCRIPT (inline script, before React starts)", () => {
  test.each(CASES)("%s → %s, same as React", (pathname, scene) => {
    expect(scriptSceneFor(pathname)).toBe(scene);
  });

  test("carries the map itself (one source of truth) and stays tiny", () => {
    expect(SCENE_FOR_SCRIPT).toContain(JSON.stringify(SCENE_BY_SECTION));
    expect(SCENE_FOR_SCRIPT.length).toBeLessThan(260);
  });
});

describe("SCENE_BY_SECTION", () => {
  test("every scene it names is drawn, and every section is a real customer route", () => {
    const routes = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
    for (const [section, scene] of Object.entries(SCENE_BY_SECTION)) {
      expect(LOADER_SCENES).toContain(scene);
      expect(routes).toContain(`route("${section}", "routes/site/`);
    }
  });
});
