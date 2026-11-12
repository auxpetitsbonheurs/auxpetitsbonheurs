// Confirmation without a second database connection (checkout spec AC48, contracts.md v0.31,
// ADR-0003 amendment 4). A successful new `placeOrder` already knows everything the
// confirmation page shows (number, order language, names of left-out lines), so it puts them in
// `apb_confirmed`: HMAC-signed, bound to the order's tracking token, scoped to that order's
// /order/:token path (the page and its `.data` request), 10 minutes, HttpOnly. The loader renders
// from it when it verifies and falls back to the normal query otherwise (refresh after expiry,
// another device, a shared link, a tampered or foreign cookie). No contact data, and no token:
// the token is only in the path and in the signed message.
//
// Key: derived per isolate from a server-only secret (SUPABASE_SERVICE_ROLE_KEY today) as
// HMAC(secret, label), so the cookie MAC never uses the secret itself. Rotating the secret only
// makes outstanding cookies fall back to the database.
import { createContext } from "react-router";
import { z } from "zod";
import { readCookie } from "~/lib/cookies";
import { SUPPORTED_LOCALES, type Locale } from "~/lib/locale";

export const CONFIRMATION_COOKIE = "apb_confirmed";
export const CONFIRMATION_MAX_AGE_SECONDS = 10 * 60;
const KEY_LABEL = "apb confirmation cookie v1";
const MAX_NAMES = 10;
const MAX_VALUE_LENGTH = 2_000;

/** What the confirmation page needs beyond the token in its path. */
export interface ConfirmationSnapshot {
  /** Formatted order number ("APB-0042"). */
  number: string;
  /** The order's language; the cookie's path is in it. */
  locale: Locale;
  /** Names of the lines left out of the order, in `locale` (AC41). */
  leftOut: string[];
}

const Payload = z.object({
  n: z.string().min(1).max(40),
  l: z.enum(SUPPORTED_LOCALES),
  o: z.array(z.string().max(200)).max(MAX_NAMES),
  x: z.number().int(),
});

export interface ConfirmationSigner {
  /** The Set-Cookie value for a just-placed order. */
  cookie(token: string, snapshot: ConfirmationSnapshot, path: string, now: Date): Promise<string>;
  /** The snapshot when the request carries a valid, unexpired cookie for `token`; else undefined. */
  read(request: Request, token: string, now: Date): Promise<ConfirmationSnapshot | undefined>;
}

/** Set per request by workers/app.ts; null (no secret) means every confirmation reads the database. */
export const confirmationContext = createContext<ConfirmationSigner | null>(null);

const encoder = new TextEncoder();
const toBase64Url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return undefined;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}

const hmacKey = (raw: BufferSource) => crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** HMAC(secret, label): the cookie key, never the secret itself. */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const master = await hmacKey(encoder.encode(secret));
  return hmacKey(await crypto.subtle.sign("HMAC", master, encoder.encode(KEY_LABEL)));
}

const signedMessage = (token: string, payload: string) => encoder.encode(`v1.${token}.${payload}`);

function decodePayload(payload: string): z.infer<typeof Payload> | undefined {
  const bytes = fromBase64Url(payload);
  if (!bytes) return undefined;
  try {
    const parsed = Payload.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** A signer for `secret`; the derived key is computed once and kept (a settled value, not a shared promise). */
export function confirmationSigner(secret: string): ConfirmationSigner {
  let key: CryptoKey | undefined;
  const getKey = async () => (key ??= await deriveKey(secret));
  return {
    async cookie(token, snapshot, path, now) {
      const expires = Math.floor(now.getTime() / 1000) + CONFIRMATION_MAX_AGE_SECONDS;
      const body = { n: snapshot.number, l: snapshot.locale, o: snapshot.leftOut.slice(0, MAX_NAMES), x: expires };
      const payload = toBase64Url(encoder.encode(JSON.stringify(body)));
      const mac = toBase64Url(await crypto.subtle.sign("HMAC", await getKey(), signedMessage(token, payload)));
      return `${CONFIRMATION_COOKIE}=${payload}.${mac}; Max-Age=${CONFIRMATION_MAX_AGE_SECONDS}; Path=${path}; HttpOnly; SameSite=Lax; Secure`;
    },
    async read(request, token, now) {
      const value = readCookie(request, CONFIRMATION_COOKIE);
      if (!value || value.length > MAX_VALUE_LENGTH) return undefined;
      const parts = value.split(".");
      if (parts.length !== 2) return undefined;
      const [payload, macText] = parts as [string, string];
      const mac = fromBase64Url(macText);
      if (!mac || mac.length !== 32) return undefined;
      // Constant-time comparison inside WebCrypto.
      if (!(await crypto.subtle.verify("HMAC", await getKey(), mac, signedMessage(token, payload)))) return undefined;
      const body = decodePayload(payload);
      if (!body || body.x * 1000 <= now.getTime()) return undefined;
      return { number: body.n, locale: body.l, leftOut: body.o };
    },
  };
}

const signers = new Map<string, ConfirmationSigner>();

/** One signer per secret per isolate, so the key is derived once, not on every request. */
export function confirmationSignerFor(secret: string): ConfirmationSigner {
  let signer = signers.get(secret);
  if (!signer) {
    signers.clear();
    signer = confirmationSigner(secret);
    signers.set(secret, signer);
  }
  return signer;
}
