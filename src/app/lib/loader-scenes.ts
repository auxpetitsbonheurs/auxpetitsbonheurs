// S-321: the page loader draws one small gold scene per destination page, chosen by the page
// being OPENED (tapping "Our story" shows the egg while Our story loads). SCENE_BY_SECTION is the
// one source of truth: React reads it through sceneFor, and the full-page-load inline script
// (lib/page-loader-script.ts) carries it serialised in SCENE_FOR_SCRIPT, so the scene is right
// before hydration too. The scenes themselves: components/shell/page-loader.tsx, app.css "S-321".

/** Every scene the loader can draw; "whisk" is the S-317 whisk and the fallback. */
export const LOADER_SCENES = ["whisk", "egg", "sugar", "flour", "hearts", "oven", "cake"] as const;
export type LoaderScene = (typeof LOADER_SCENES)[number];

/**
 * First path segment (after the /fr prefix, routes.ts) → scene. Home and every other page
 * (basket, checkout, tracking, account, privacy…) get the whisk. `menu` covers /menu/:slug and
 * `workshops` /workshops/:slug.
 */
export const SCENE_BY_SECTION = {
  "our-story": "egg",
  menu: "sugar",
  "custom-cake": "flour",
  workshops: "hearts",
  gallery: "oven",
  contact: "cake",
} as const satisfies Record<string, LoaderScene>;

/** The scene shown while `pathname` (the destination) loads. */
export function sceneFor(pathname: string): LoaderScene {
  const segments = pathname.split("/");
  if (segments[1] === "fr") segments.splice(1, 1);
  const section = segments[1] ?? "";
  return Object.hasOwn(SCENE_BY_SECTION, section) ? SCENE_BY_SECTION[section as keyof typeof SCENE_BY_SECTION] : "whisk";
}

/** sceneFor as plain browser script (an expression), with the map serialised into it. */
export const SCENE_FOR_SCRIPT =
  `function(p){var m=${JSON.stringify(SCENE_BY_SECTION)},s=p.split("/");if(s[1]==="fr")s.splice(1,1);` +
  `return{}.hasOwnProperty.call(m,s[1])?m[s[1]]:"whisk"}`;
