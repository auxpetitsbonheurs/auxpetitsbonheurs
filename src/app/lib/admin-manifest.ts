// The admin app's web app manifest (S-035 AC1, FR-047): installable from /admin, opens
// standalone. Public and static: names, colours and icon paths only, no admin data (AC6).
// Colours are the light theme's `color.surface` (header and bars) and `color.bg` from
// docs/design/tokens.json (admin-manifest.test.ts keeps them in step).

export const ADMIN_THEME = {
  light: { surface: "#FFFDF8", bg: "#FAF5EC" },
  dark: { surface: "#271E17", bg: "#1C1510" },
} as const;

export const ADMIN_ICONS = [
  { src: "/admin/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/admin/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/admin/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

/**
 * `start_url` is `/admin/` with the trailing slash: a start URL outside `scope` makes the
 * browser drop the scope, and `/admin` (no slash) is not inside `/admin/`. Both open Today.
 */
export function adminManifest() {
  return {
    id: "/admin/",
    name: "Aux petits bonheurs",
    short_name: "Petits bonheurs",
    description: "Orders and menu of the bakery / Commandes et menu de la pâtisserie",
    scope: "/admin/",
    start_url: "/admin/",
    display: "standalone",
    orientation: "portrait",
    theme_color: ADMIN_THEME.light.surface,
    background_color: ADMIN_THEME.light.bg,
    icons: ADMIN_ICONS,
  };
}
