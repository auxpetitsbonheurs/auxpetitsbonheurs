// Supabase Auth "Send Email" hook (S-024, contracts.md "Webhooks"): Standard Webhooks
// signature check, payload shape, and the link the email carries. The link is rebuilt
// from the site's own origin; Supabase's `redirect_to` only contributes a relative `next`
// (architecture "Security", threat-model G-04).
import { z } from "zod";
import type { Locale } from "~/lib/locale";

/** Deliveries older (or newer) than this are refused (S-024 AC2). */
export const HOOK_TOLERANCE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const bytesToBase64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** Same length and same characters, without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Standard Webhooks: HMAC-SHA256 of `<id>.<timestamp>.<body>` with the base64 secret after
 * `v1,whsec_`; the header holds space-separated `v1,<base64>` signatures.
 */
export async function verifyWebhook(secret: string, headers: WebhookHeaders, body: string, now: Date): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > HOOK_TOLERANCE_SECONDS) return false;
  const keyBytes = base64ToBytes(secret.replace(/^v1,/, "").replace(/^whsec_/, ""));
  if (!keyBytes || keyBytes.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = bytesToBase64(await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${body}`)));
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && typeof value === "string" && sameText(value, expected);
  });
}

/** The payload fields the hook reads; anything else Supabase sends is ignored. */
export const HookPayload = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.email(),
    user_metadata: z.record(z.string(), z.unknown()).nullish(),
  }),
  email_data: z.object({
    token_hash: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
    redirect_to: z.string().max(2048).default(""),
    email_action_type: z.string(),
  }),
});

export type HookPayload = z.infer<typeof HookPayload>;

/** Every Supabase email type the hook renders (S-194 AC1) and the email each one becomes. */
export const HANDLED_ACTIONS = ["recovery", "signup", "magiclink", "email_change", "invite"] as const;
export type HandledAction = (typeof HANDLED_ACTIONS)[number];

/** `user_metadata.locale` when it is one we have; undefined otherwise (AC4: then English or the admin's own). */
export function metadataLocale(payload: HookPayload): Locale | undefined {
  const locale = payload.user.user_metadata?.locale;
  return locale === "fr" || locale === "en" ? locale : undefined;
}

/** A path on this site: starts with one "/", no backslash or control character. */
function isRelativePath(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused here
  return value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(value);
}

/**
 * The `next` path for the link, from `redirect_to`: it must be on `siteUrl` (AC3). A
 * `next` query parameter wins (`…/auth/confirm?next=/admin/reset`), else the path itself.
 * `null` when the origin differs or `next` is not a relative path.
 */
export function nextFromRedirect(redirectTo: string, siteUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(redirectTo);
  } catch {
    return null;
  }
  if (url.origin !== new URL(siteUrl).origin) return null;
  const param = url.searchParams.get("next");
  const next = param ?? `${url.pathname}${url.search}`;
  return isRelativePath(next) ? next : null;
}

/** `<SITE_URL>/auth/confirm?token_hash=…&type=…&next=…` (S-024 AC1). */
export function confirmLink(siteUrl: string, tokenHash: string, type: string, next: string): string {
  const query = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${new URL(siteUrl).origin}/auth/confirm?${query.toString().replaceAll("%2F", "/")}`;
}
