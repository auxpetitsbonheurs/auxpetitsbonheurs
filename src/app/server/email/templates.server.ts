// Auth email templates E-02 needs (S-024: recovery; S-028 adds the invitation). EN/FR
// from the server catalogue (FR falls back to EN per key, NFR-007). Each email holds the
// bakery name, one sentence saying why it was sent, the link and when it expires: never a
// password, never order data (NFR-004). Wording reviewed by `copywriter` before launch (E-12).
import { formatDayLabel } from "~/domain/time";
import { t } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";

export const BAKERY_NAME = "Aux petits bonheurs";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** Recovery links last as long as Supabase's email OTP expiry (default 1 hour). */
export const RECOVERY_LINK_MINUTES = 60;

/** Inline styles only (email clients drop <style>); colours from the light theme tokens. */
function layout(locale: Locale, parts: { heading: string; reason: string; button: string; link: string; expiry: string; ignore: string }): string {
  const link = escapeHtml(parts.link);
  return `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:24px;background:#faf5ec;color:#3a2a1c;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:520px;margin:0 auto">
<p style="font-family:Georgia,serif;font-size:22px;margin:0 0 16px">${escapeHtml(BAKERY_NAME)}</p>
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(parts.heading)}</h1>
<p style="margin:0 0 20px">${escapeHtml(parts.reason)}</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#8c5a1e;color:#fffdf8;text-decoration:none;border-radius:8px;font-weight:bold">${escapeHtml(parts.button)}</a></p>
<p style="margin:0 0 12px;word-break:break-all;font-size:14px"><a href="${link}" style="color:#8c5a1e">${link}</a></p>
<p style="margin:0 0 12px">${escapeHtml(parts.expiry)}</p>
<p style="margin:0;font-size:14px">${escapeHtml(parts.ignore)}</p>
</div>
</body>
</html>`;
}

export interface InvitationDetails {
  inviterName: string;
  role: "owner" | "admin";
  link: string;
  /** Mauritius calendar date the link lasts until (`YYYY-MM-DD`). */
  expiresOn: string;
}

/**
 * The invitation email (S-028 AC7): bakery name, who invited, the role in plain words,
 * the link and "valid until Thu 19 Nov". Not the invitee's email or anything else personal.
 */
export function invitationEmail(locale: Locale, details: InvitationDetails): RenderedEmail {
  const vars = { bakery: BAKERY_NAME, inviter: details.inviterName };
  const parts = {
    heading: t("email.invitation.heading", locale, vars),
    reason: t(`email.invitation.reason_${details.role}`, locale, vars),
    button: t("email.invitation.button", locale),
    link: details.link,
    expiry: t("email.invitation.expiry", locale, { date: formatDayLabel(details.expiresOn, locale) }),
    ignore: t("email.invitation.ignore", locale),
  };
  const text = [BAKERY_NAME, "", parts.heading, "", parts.reason, "", details.link, "", parts.expiry, parts.ignore].join("\n");
  return { subject: t("email.invitation.subject", locale, vars), html: layout(locale, parts), text };
}

/** The password reset email (S-024 AC1, AC4, AC7). */
export function recoveryEmail(locale: Locale, link: string): RenderedEmail {
  const parts = {
    heading: t("email.recovery.heading", locale),
    reason: t("email.recovery.reason", locale, { bakery: BAKERY_NAME }),
    button: t("email.recovery.button", locale),
    link,
    expiry: t("email.recovery.expiry", locale, { count: RECOVERY_LINK_MINUTES / 60 }),
    ignore: t("email.recovery.ignore", locale),
  };
  const text = [BAKERY_NAME, "", parts.heading, "", parts.reason, "", link, "", parts.expiry, parts.ignore].join("\n");
  return { subject: t("email.recovery.subject", locale, { bakery: BAKERY_NAME }), html: layout(locale, parts), text };
}
