// Brand pages the client edits (E-13 S-245..S-250, FR-078). Pure: shared by the admin Pages
// editor (fields, limits, hints), the save and the public read (data-model.md `site_page`).

export const SITE_PAGE_KEYS = ["our_story", "workshops", "gallery", "contact", "custom_order"] as const;
export type SitePageKey = (typeof SITE_PAGE_KEYS)[number];

export function isSitePageKey(value: unknown): value is SitePageKey {
  return typeof value === "string" && (SITE_PAGE_KEYS as readonly string[]).includes(value);
}

/** Editable text fields of each page (S-245 AC1), in the order the editor shows them. */
export const SITE_PAGE_FIELDS = {
  our_story: ["intro", "body"],
  workshops: ["intro", "body"],
  gallery: ["intro"],
  contact: ["intro", "hours", "pickup_note"],
  custom_order: ["intro", "body"],
} as const satisfies Record<SitePageKey, readonly string[]>;

export type SitePageField = (typeof SITE_PAGE_FIELDS)[SitePageKey][number];

/** Characters per language (S-245 Notes: as S-059, intro 300). */
export const PAGE_INTRO_MAX = 300;
export const PAGE_TEXT_MAX = 10_000;
export const fieldMax = (field: SitePageField) => (field === "intro" ? PAGE_INTRO_MAX : PAGE_TEXT_MAX);

/** Photos per page (S-245 AC1); the database enforces the same slots. Gallery photos live in Gallery. */
export const PAGE_PHOTO_LIMITS: Record<SitePageKey, number> = { our_story: 4, workshops: 6, gallery: 0, contact: 0, custom_order: 3 };

/** Alt text per language (S-247 AC3). */
export const PHOTO_ALT_MAX = 200;

/** Text in English and (optionally) French; blank French shows the English (NFR-007). */
export interface PageText {
  en: string;
  fr?: string;
}

export type PageContent = Partial<Record<SitePageField, PageText>>;

/** Public paths of the pages that have their own route (contact and custom order: batch D). */
export const SITE_PAGE_PATHS: Partial<Record<SitePageKey, string>> = {
  our_story: "/our-story",
  workshops: "/workshops",
  gallery: "/gallery",
  contact: "/contact",
  custom_order: "/custom-cake",
};

/** Storage prefix for a page's photos (S-245 Notes): `site/pages/<key>/<adminId>/<uploadSessionId>/`. */
export function pagePhotoPrefix(key: SitePageKey, adminId: string, uploadSessionId: string): string {
  return `site/pages/${key}/${adminId}/${uploadSessionId}/`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PAGE_PHOTO_PATH = new RegExp(`^site/pages/([a-z_]+)/(${UUID})/(${UUID})/${UUID}\\.(webp|jpg|png)$`);

/** True when `path` is exactly a path issued to this admin, for this page and editor session. */
export function isIssuedPagePhotoPath(path: string, key: SitePageKey, adminId: string, uploadSessionId: string): boolean {
  const match = PAGE_PHOTO_PATH.exec(path);
  return match !== null && match[1] === key && match[2] === adminId.toLowerCase() && match[3] === uploadSessionId.toLowerCase();
}

/** Any page photo path of `key` (issued in any session): what a stored row may hold. */
export function isPagePhotoPath(path: string, key: SitePageKey): boolean {
  return PAGE_PHOTO_PATH.exec(path)?.[1] === key;
}

/** The upload scope the editor asks `admin/uploads` for: `page:<key>`. */
export const pageUploadScope = (key: SitePageKey) => `page:${key}` as const;
