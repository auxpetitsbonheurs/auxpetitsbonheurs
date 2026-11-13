// The sender behind typed env config: RESEND_API_KEY and EMAIL_FROM make the Resend mailer,
// SITE_URL is the origin of every link. Any of them missing means "not set up": null, and the
// outbox keeps the rows. The key is never logged.
import { resendMailer, type Mailer } from "./sender.server";

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** The Resend mailer, or null while RESEND_API_KEY / EMAIL_FROM are not both set. */
export function mailerFromEnv(env: Readonly<Record<string, unknown>>, fetch?: typeof globalThis.fetch): Mailer | null {
  const apiKey = text(env.RESEND_API_KEY);
  const from = text(env.EMAIL_FROM);
  return apiKey && from ? resendMailer({ apiKey, from, ...(fetch ? { fetch } : {}) }) : null;
}

/** The site's origin from SITE_URL, or null when it is not set or not a URL. */
export function siteUrlFromEnv(env: Readonly<Record<string, unknown>>): string | null {
  const value = text(env.SITE_URL);
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
