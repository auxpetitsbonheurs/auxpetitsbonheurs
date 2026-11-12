// Invitation tokens (data-model "admin_invitation", NFR-003): 32 random bytes as base64url
// (43 characters, 256 bits) in the emailed link; only the SHA-256 (hex) is stored, so a
// database read never yields a working link. Web Crypto: the same code in Workers and Node.
import { INVITE_TOKEN_PATTERN } from "~/domain/admin-account";

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

export function newInvitationToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function invitationTokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Shape check before any database read (S-029 AC7). */
export const isInvitationToken = (token: unknown): token is string => typeof token === "string" && INVITE_TOKEN_PATTERN.test(token);

/** The accept page's address for a token, on the site's own origin. */
export const invitationLink = (origin: string, token: string) => `${origin}/admin/invite/${token}`;
