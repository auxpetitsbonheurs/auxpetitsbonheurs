// S-253 AC1, AC3, AC5, AC8 (FR-081): the head every new customer page builds through lib/seo.
import { describe, expect, test } from "vitest";
import { t } from "~/i18n/catalog.server";
import en from "~/i18n/en.json";
import fr from "~/i18n/fr.json";
import type { Locale } from "~/lib/locale";
import { DESCRIPTION_LENGTH, canonicalUrl, handlesOwnShareImage, pageTitle, rootOrigin, seoMeta } from "~/lib/seo";
import { meta as menuMeta } from "./menu";

const ORIGIN = "https://apb.test";

/** Each new customer page and its title/description keys (S-244, S-248..S-252). */
const PAGES = [
  { path: "/menu", title: "collection.title", description: "collection.metaDescription" },
  { path: "/contact", title: "contactPage.title", description: "contactPage.metaDescription" },
  { path: "/custom-cake", title: "customOrderPage.title", description: "customOrderPage.metaDescription" },
  { path: "/our-story", title: "sitePages.ourStory.title", description: "sitePages.ourStory.metaDescription" },
  { path: "/workshops", title: "sitePages.workshops.title", description: "sitePages.workshops.metaDescription" },
  { path: "/gallery", title: "sitePages.gallery.title", description: "sitePages.gallery.metaDescription" },
] as const;

const LOCALES: Locale[] = ["en", "fr"];

describe("titles and descriptions (AC1, AC8)", () => {
  test("every page has a unique title per language, under 60 characters with the site name", () => {
    const titles = LOCALES.flatMap((locale) => PAGES.map((p) => pageTitle(t(p.title, locale))));

    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) expect(title.length).toBeLessThanOrEqual(60);
    expect(pageTitle(t("contactPage.title", "en"))).toBe("Contact us | Aux petits bonheurs");
  });

  test.each(LOCALES)("descriptions in %s are 50 to 160 characters and written in that language", (locale) => {
    const messages = locale === "en" ? en : fr;
    for (const p of PAGES) {
      // Walks the dotted key in this catalogue only (no EN fallback): "sitePages.ourStory.metaDescription".
      const own = p.description.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages) as string;
      expect(own, `${locale} ${p.description}`).toBeTruthy(); // present in the catalogue itself (no EN fallback)
      expect(own.length).toBeGreaterThanOrEqual(DESCRIPTION_LENGTH.min);
      expect(own.length).toBeLessThanOrEqual(DESCRIPTION_LENGTH.max);
    }
    expect(t("contactPage.metaDescription", "fr")).not.toBe(t("contactPage.metaDescription", "en"));
  });
});

describe("seoMeta (AC1, AC3, AC5)", () => {
  const page = { origin: ORIGIN, locale: "fr" as const, path: "/contact", title: "Contact", description: "Une description de la page de contact assez longue." };

  test("canonical and og:url are absolute, in the page language, without query or fragment", () => {
    const tags = seoMeta({ ...page, path: "/custom-cake?fromGallery=1#top" });

    expect(tags).toContainEqual({ tagName: "link", rel: "canonical", href: "https://apb.test/fr/custom-cake" });
    expect(tags).toContainEqual({ property: "og:url", content: "https://apb.test/fr/custom-cake" });
    expect(canonicalUrl(ORIGIN, "en", "/")).toBe("https://apb.test/");
  });

  test("Open Graph and Twitter carry the title and description; og:locale follows the language", () => {
    const tags = seoMeta(page);

    expect(tags).toEqual(
      expect.arrayContaining([
        { title: "Contact | Aux petits bonheurs" },
        { name: "description", content: page.description },
        { property: "og:title", content: "Contact | Aux petits bonheurs" },
        { property: "og:description", content: page.description },
        { property: "og:locale", content: "fr_MU" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Contact | Aux petits bonheurs" },
        { name: "twitter:description", content: page.description },
      ]),
    );
  });

  test("AC3: the page's first photo is the absolute share image; without one, the brand image with its size", () => {
    const ogImages = (tags: ReturnType<typeof seoMeta>) => tags.filter((tag) => "property" in tag && tag.property === "og:image");

    expect(ogImages(seoMeta({ ...page, image: "/images/story.jpg" }))).toEqual([{ property: "og:image", content: "https://apb.test/images/story.jpg" }]);
    expect(seoMeta({ ...page, image: "https://cdn.test/a.jpg" })).toContainEqual({ name: "twitter:image", content: "https://cdn.test/a.jpg" });
    const brand = seoMeta(page);
    expect(ogImages(brand)).toEqual([{ property: "og:image", content: "https://apb.test/brand/og-image.png" }]);
    expect(brand).toContainEqual({ property: "og:image:width", content: "1200" });
  });

  test("AC3: routes using seoMeta tell the site layout to leave out its brand image (one og:image)", async () => {
    const routes = await Promise.all([import("./contact"), import("./custom-order"), import("./menu"), import("../home"), import("./our-story"), import("./workshops"), import("./gallery")]);

    for (const route of routes) expect(handlesOwnShareImage(route.handle)).toBe(true);
    expect(handlesOwnShareImage(undefined)).toBe(false);
  });

  test("AC5: placeholder pages are noindex; others are not", () => {
    expect(seoMeta({ ...page, noindex: true })).toContainEqual({ name: "robots", content: "noindex" });
    expect(seoMeta(page).some((tag) => "name" in tag && tag.name === "robots")).toBe(false);
  });

  test("rootOrigin reads the root loader's origin", () => {
    expect(rootOrigin([{ id: "root", loaderData: { origin: ORIGIN } }, { id: "x" }])).toBe(ORIGIN);
    expect(rootOrigin([])).toBeNull();
  });
});

describe("Our collection head (AC1, AC5)", () => {
  test("canonical /menu without filters, never noindex, in both languages", () => {
    const matches = [{ id: "root", loaderData: { origin: ORIGIN } }];
    const fr = menuMeta({ loaderData: { title: "Notre collection", description: "d" }, matches, location: { pathname: "/fr/menu", search: "?type=cake" } } as never);

    expect(fr).toContainEqual({ title: "Notre collection | Aux petits bonheurs" });
    expect(fr).toContainEqual({ tagName: "link", rel: "canonical", href: "https://apb.test/fr/menu" });
    expect(fr.some((tag) => "name" in tag && tag.name === "robots")).toBe(false);
  });
});
