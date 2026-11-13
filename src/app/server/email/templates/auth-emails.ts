// Account emails (S-194): confirm, sign-in link, password reset, new email, invitation. Sent
// straight through Resend by the Supabase hook (or the invitation outbox row), never queued
// with a link in the database. One link, why you got it, how long it works. No order data.
import { formatDayLabel } from "~/domain/time";
import { t } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";
import { BAKERY_NAME, type Block, type RenderedEmail, renderEmail } from "./layout";

/** Recovery links last as long as Supabase's email OTP expiry (default 1 hour). */
export const RECOVERY_LINK_MINUTES = 60;

export type AuthEmailKind = "signup_confirm" | "sign_in_link" | "password_reset" | "email_change" | "invite";

const COPY_KEYS: Record<Exclude<AuthEmailKind, "password_reset">, string> = {
  signup_confirm: "email.auth.signup",
  sign_in_link: "email.auth.signIn",
  email_change: "email.auth.emailChange",
  invite: "email.auth.invite",
};

function linkEmail(locale: Locale, siteUrl: string | null, parts: { subject: string; heading: string; reason: string; button: string; link: string; expiry: string; ignore: string }): RenderedEmail {
  const blocks: Block[] = [
    { kind: "p", text: parts.reason },
    { kind: "button", label: parts.button, href: parts.link },
    { kind: "link", label: "", href: parts.link, htmlOnly: true },
    { kind: "p", text: parts.expiry },
    { kind: "note", text: parts.ignore },
  ];
  return renderEmail({ locale, siteUrl, subject: parts.subject, heading: parts.heading, blocks, footer: t("email.auth.footer", locale, { bakery: BAKERY_NAME }) });
}

/** `siteUrl` only picks the logo's origin; the link carries its own. */
export function authEmail(kind: AuthEmailKind, locale: Locale, link: string, siteUrl: string | null = link): RenderedEmail {
  const vars = { bakery: BAKERY_NAME };
  if (kind === "password_reset") {
    return linkEmail(locale, siteUrl, {
      subject: t("email.recovery.subject", locale, vars),
      heading: t("email.recovery.heading", locale),
      reason: t("email.recovery.reason", locale, vars),
      button: t("email.recovery.button", locale),
      link,
      expiry: t("email.recovery.expiry", locale, { count: RECOVERY_LINK_MINUTES / 60 }),
      ignore: t("email.recovery.ignore", locale),
    });
  }
  const key = COPY_KEYS[kind];
  return linkEmail(locale, siteUrl, {
    subject: t(`${key}.subject`, locale, vars),
    heading: t(`${key}.heading`, locale),
    reason: t(`${key}.reason`, locale, vars),
    button: t(`${key}.button`, locale),
    link,
    expiry: t("email.auth.expiryHour", locale),
    ignore: t("email.auth.ignore", locale),
  });
}

export interface InvitationDetails {
  inviterName: string;
  role: "owner" | "admin";
  link: string;
  /** Mauritius calendar date the link lasts until (`YYYY-MM-DD`). */
  expiresOn: string;
}

/** The admin invitation (S-028 AC7): who invited, the role in plain words, the link, "valid until Thu 19 Nov". */
export function invitationEmail(locale: Locale, details: InvitationDetails): RenderedEmail {
  const vars = { bakery: BAKERY_NAME, inviter: details.inviterName };
  return linkEmail(locale, details.link, {
    subject: t("email.invitation.subject", locale, vars),
    heading: t("email.invitation.heading", locale, vars),
    reason: t(`email.invitation.reason_${details.role}`, locale, vars),
    button: t("email.invitation.button", locale),
    link: details.link,
    expiry: t("email.invitation.expiry", locale, { date: formatDayLabel(details.expiresOn, locale) }),
    ignore: t("email.invitation.ignore", locale),
  });
}

/** The customer account emails (E-11): confirm a sign-up, a one-time sign-in link, a password reset. */
export type CustomerAuthEmail = "signup" | "magiclink" | "customerRecovery";

/** S-206 confirmation, S-208 sign-in link, S-209 reset: why it was sent, the link, 1 hour, ignore it. */
export function customerAuthEmail(kind: CustomerAuthEmail, locale: Locale, link: string, siteUrl: string | null = link): RenderedEmail {
  const key = `email.${kind}`;
  const vars = { bakery: BAKERY_NAME };
  return linkEmail(locale, siteUrl, {
    subject: t(`${key}.subject`, locale, vars),
    heading: t(`${key}.heading`, locale, vars),
    reason: t(`${key}.reason`, locale, vars),
    button: t(`${key}.button`, locale),
    link,
    expiry: t("email.recovery.expiry", locale, { count: RECOVERY_LINK_MINUTES / 60 }),
    ignore: t(`${key}.ignore`, locale),
  });
}
