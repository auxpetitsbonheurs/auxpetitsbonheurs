// RL-auth for the admin sign-in, forgot-password and reset actions (S-023, NFR-003):
// 5 attempts per 15 minutes per email + IP and action. The check never looks the email
// up, so the limited answer is the same for known and unknown accounts.
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import type { GuardArgs } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { RL_AUTH, type RateLimitResult, type RateLimitSubject, consumeRateLimit, rateLimitKey } from "~/server/rate-limit.server";
import { rateLimitBucket } from "~/db/schema";
import { eq } from "drizzle-orm";

export const AUTH_ACTIONS = {
  signIn: "admin.signIn",
  forgot: "admin.forgot",
  reset: "admin.reset",
  changePassword: "admin.changePassword",
  /** Accepting an invitation (S-029): counted per IP, so trying many links is limited too. */
  acceptInvite: "admin.acceptInvite",
  /** Customer accounts (E-11): counted apart from the admin ones, same RL-auth class. */
  customerSignIn: "customer.signIn",
  customerLink: "customer.signInLink",
  customerReset: "customer.reset",
  customerSetPassword: "customer.setPassword",
} as const;
export type AuthAction = (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS];

/**
 * The visitor's IP as Cloudflare reports it (`CF-Connecting-IP`, set by the edge and not
 * forgeable by a client on the deployed Worker); "unknown" when absent (local runs).
 */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function subject(args: GuardArgs, action: AuthAction, email: string): RateLimitSubject {
  return { action, parts: [email, clientIp(args.request)] };
}

/** Counts one attempt of `action` for `email` from this IP. */
export function consumeAuthAttempt(args: GuardArgs, action: AuthAction, email: string): Promise<RateLimitResult> {
  return consumeRateLimit(args.context.get(requestDbContext).db, RL_AUTH, subject(args, action, email), args.context.get(clockContext).now());
}

/** After a successful sign-in the count starts again, so the Owner is never locked out by her own typos. */
export async function clearAuthAttempts(args: GuardArgs, action: AuthAction, email: string): Promise<void> {
  await args.context.get(requestDbContext).db.delete(rateLimitBucket).where(eq(rateLimitBucket.key, rateLimitKey(subject(args, action, email))));
}

/** `RATE_LIMITED` (429) with `Retry-After` and `retryAfterMinutes` for the page; `extra` echoes safe form values. */
export function rateLimitedResult<Extra extends object>(retryAfterSeconds: number, locale: Locale, extra: Extra) {
  return actionError("RATE_LIMITED", locale, {
    extra: { ...extra, retryAfterMinutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) },
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
