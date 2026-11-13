// POST /api/banner/dismiss (S-062 AC3, AC7; contracts.md `dismissBanner`): adds the promotion
// id to the session cookie that hides the banner for the rest of the visit. Public, no
// database write; it only changes the caller's own cookie, so it needs no CSRF check.
// With JavaScript the banner posts `respond=inline` and gets `{ ok: true }`; a plain form post
// (no JavaScript) is sent back to the page it came from (`next`, a local path only).
import { t } from "~/i18n/catalog.server";
import { localeFromPathname } from "~/lib/locale";
import { Uuid } from "~/server/contracts/shared";
import { dismissCookie } from "~/server/banner.server";
import type { Route } from "./+types/banner-dismiss";

/**
 * A same-site path to go back to; anything else is home: absolute or protocol-relative URLs,
 * backslashes, and whitespace or control characters (browsers drop tabs and newlines, so
 * "/<tab>/evil.example" would become protocol-relative).
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || /[\s\\]/u.test(value) || [...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const next = safeReturnPath(form.get("next"));
  const id = Uuid.safeParse(form.get("promotionId"));
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (!id.success) {
    const locale = localeFromPathname(next);
    return Response.json({ ok: false, error: { code: "VALIDATION_FAILED", message: t("errors.codes.VALIDATION_FAILED", locale) } }, { status: 400, headers });
  }
  headers.set("Set-Cookie", dismissCookie(request, id.data.toLowerCase()));
  if (form.get("respond") === "inline") return Response.json({ ok: true }, { headers });
  headers.set("Location", next);
  return new Response(null, { status: 303, headers });
}

/** GET is not a way to dismiss (a link prefetch must not change anything). */
export function loader() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
