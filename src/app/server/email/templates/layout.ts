// The one branded email layout (S-188). Every email is a list of blocks; this file turns the
// same blocks into the HTML (single column <= 600 px, inline styles only: email clients drop
// <style>) and the plain-text alternative, so the two never drift apart. Colours are the
// light tokens of docs/design/tokens.json; every text/background pair is checked in
// layout.test.ts (>= 4.5:1). No tracking pixel, no script; every user string is escaped.
import { t } from "~/i18n/catalog.server";
import { EMAIL_BADGE } from "~/lib/brand";
import type { Locale } from "~/lib/locale";

export const BAKERY_NAME = "Aux petits bonheurs";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The palette, from tokens.json (brand v0.3). Exported so the contrast test reads the same values. */
export const EMAIL_COLORS = {
  page: "#FBF3E8",
  card: "#FFFBF5",
  band: "#F6EAD8",
  text: "#3B1512",
  muted: "#5E3F38",
  link: "#520909",
  button: "#660C0C",
  onButton: "#FCEAD8",
  rule: "#BA8430",
} as const;

export const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export interface Item {
  /** "2 × Chocolate cake" */
  title: string;
  /** Options and the cake message, one short line each. */
  details: string[];
  price: string;
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "button"; label: string; href: string }
  /** A text link line under a label. */
  | { kind: "link"; label: string; href: string; /** Visible URL for copy-paste in HTML only; the text version already has it. */ htmlOnly?: boolean }
  /** Label above value, one per row: stacks at any width, nothing to scroll. */
  | { kind: "facts"; rows: { label: string; value: string }[] }
  | { kind: "items"; items: Item[]; totalLabel: string; total: string }
  /** The shaded call-out: one important sentence. */
  | { kind: "note"; text: string }
  /** Pre-rendered, already escaped (the payment steps). */
  | { kind: "raw"; html: string; text: string };

export interface EmailParts {
  locale: Locale;
  subject: string;
  /** The h1. */
  heading: string;
  blocks: Block[];
  /** Origin of the site, for the logo; without a usable one the bakery name is written out. */
  siteUrl: string | null;
  /** One line under the card: why this email was sent. */
  footer?: string;
}

const FONT = "Arial,Helvetica,sans-serif";
const P = `margin:0 0 16px;font-size:16px;line-height:1.5;color:${EMAIL_COLORS.text}`;

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function logo(siteUrl: string | null): string {
  const origin = originOf(siteUrl);
  const name = `<p style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${EMAIL_COLORS.button}">${escapeHtml(BAKERY_NAME)}</p>`;
  if (!origin) return name;
  // The Owner's burgundy badge as a PNG on the site origin (email clients render neither SVG nor
  // WebP reliably), 2x for sharp phones; its alt text is the bakery name.
  const px = EMAIL_BADGE.displayPx;
  return `<img src="${escapeHtml(origin)}${EMAIL_BADGE.path}" width="${px}" height="${px}" alt="${escapeHtml(BAKERY_NAME)}" style="display:block;margin:0 auto;border:0;width:${px}px;height:${px}px">`;
}

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "p":
      return `<p style="${P}">${escapeHtml(block.text)}</p>`;
    case "h2":
      return `<h2 style="margin:24px 0 8px;font-size:18px;line-height:1.3;color:${EMAIL_COLORS.text}">${escapeHtml(block.text)}</h2>`;
    case "button":
      return `<p style="margin:0 0 16px"><a href="${escapeHtml(block.href)}" style="display:block;box-sizing:border-box;min-height:44px;padding:13px 20px;background:${EMAIL_COLORS.button};color:${EMAIL_COLORS.onButton};font-size:16px;line-height:1.3;font-weight:bold;text-align:center;text-decoration:none;border-radius:8px">${escapeHtml(block.label)}</a></p>`;
    case "link":
      return `<p style="${P};overflow-wrap:anywhere;word-break:break-word">${block.label ? `${escapeHtml(block.label)}<br>` : ""}<a href="${escapeHtml(block.href)}" style="color:${EMAIL_COLORS.link};text-decoration:underline">${escapeHtml(block.href)}</a></p>`;
    case "facts":
      return block.rows
        .map((row) => `<p style="${P};margin-bottom:12px"><span style="color:${EMAIL_COLORS.muted};font-size:14px;line-height:1.4">${escapeHtml(row.label)}</span><br><strong>${escapeHtml(row.value)}</strong></p>`)
        .join("\n");
    case "items": {
      const rows = block.items
        .map((item) => {
          const details = item.details.map((line) => `<br><span style="color:${EMAIL_COLORS.muted};font-size:14px;line-height:1.4">${escapeHtml(line)}</span>`).join("");
          return `<li style="margin:0 0 10px;padding:0 0 10px;border-bottom:1px solid ${EMAIL_COLORS.band};font-size:16px;line-height:1.5">${escapeHtml(item.title)}${details}<br><strong>${escapeHtml(item.price)}</strong></li>`;
        })
        .join("");
      return `<ul style="margin:0 0 12px;padding:0;list-style:none">${rows}</ul>\n<p style="${P};font-size:18px"><strong>${escapeHtml(block.totalLabel)}: ${escapeHtml(block.total)}</strong></p>`;
    }
    case "note":
      return `<p style="${P};padding:12px 14px;background:${EMAIL_COLORS.band};border-radius:8px">${escapeHtml(block.text)}</p>`;
    case "raw":
      return block.html;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "h2":
      return block.text.toUpperCase();
    case "button":
      return `${block.label}\n${block.href}`;
    case "link":
      return block.htmlOnly ? "" : `${block.label}\n${block.href}`;
    case "facts":
      return block.rows.map((row) => `${row.label}: ${row.value}`).join("\n");
    case "items":
      return [
        ...block.items.map((item) => [`- ${item.title}`, ...item.details.map((line) => `  ${line}`), `  ${item.price}`].join("\n")),
        `${block.totalLabel}: ${block.total}`,
      ].join("\n");
    case "raw":
      return block.text;
  }
}

/** The finished email: subject, HTML and the plain-text alternative. */
export function renderEmail(parts: EmailParts): RenderedEmail {
  const { locale, heading, blocks } = parts;
  const footer = parts.footer ?? t("email.layout.footer", locale, { bakery: BAKERY_NAME });
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(parts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.page};color:${EMAIL_COLORS.text};font-family:${FONT};font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%">
<div style="padding:16px 12px;background:${EMAIL_COLORS.page}">
<div style="max-width:600px;margin:0 auto">
<div role="banner" style="padding:8px 0 16px;text-align:center;border-bottom:2px solid ${EMAIL_COLORS.rule}">${logo(parts.siteUrl)}</div>
<div style="margin:16px 0 0;padding:20px 16px;background:${EMAIL_COLORS.card};border-radius:8px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${EMAIL_COLORS.text}">${escapeHtml(heading)}</h1>
${blocks.map(blockHtml).join("\n")}
</div>
<p style="margin:16px 0 0;padding:0 4px;font-size:14px;line-height:1.5;color:${EMAIL_COLORS.muted};text-align:center">${escapeHtml(footer)}</p>
</div>
</div>
</body>
</html>`;
  const text = [BAKERY_NAME, "", heading, "", ...blocks.map(blockText).filter((part) => part !== "").flatMap((part) => [part, ""]), "--", footer].join("\n");
  return { subject: parts.subject, html, text };
}
