// /sitemap.xml body (S-253 AC4, shared with S-071): every listed path in English and French,
// each `<url>` carrying `xhtml:link` alternates for en, fr and x-default (English). Pure.
import { localePath } from "~/lib/locale";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function urlEntry(loc: string, en: string, fr: string): string {
  const alt = (lang: string, href: string) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(href)}"/>`;
  return ["  <url>", `    <loc>${escapeXml(loc)}</loc>`, alt("en", en), alt("fr", fr), alt("x-default", en), "  </url>"].join("\n");
}

/** `paths` are unprefixed ("/", "/menu"); each yields an English and a French `<url>`. */
export function sitemapXml(origin: string, paths: readonly string[]): string {
  const urls = [...new Set(paths)].flatMap((path) => {
    const en = `${origin}${localePath("en", path)}`;
    const fr = `${origin}${localePath("fr", path)}`;
    return [urlEntry(en, en, fr), urlEntry(fr, en, fr)];
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
