// The customer emails behind sign-up, sign-in links and password resets (S-206, S-208, S-209;
// contracts.md "Customer accounts"). Every branch answers the same way to the page, so nobody can
// learn whether an address has an account (NFR-003); what actually happens:
// - an admin's address: nothing (admins use /admin; it never becomes a customer, S-206 AC4);
// - a confirmed customer account: sign-up sends a sign-in link instead of a confirmation;
// - anyone else: sign-up creates an UNCONFIRMED Auth user with a random 32-byte password that is
//   never stored or shown (threat-model G-01), or resends the confirmation for one.
// Each address gets at most one such email a minute (RL-email-resend); Auth failures are logged
// with the step name only, never the address.
import type { Locale } from "~/lib/locale";
import { localePath } from "~/lib/locale";
import { authContext } from "~/server/auth-gateway.server";
import type { GuardArgs } from "~/server/auth.server";
import { clientIp } from "~/server/auth-rate-limit.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { RL_EMAIL_RESEND, RL_SIGNUP, type RateLimitResult, consumeRateLimit } from "~/server/rate-limit.server";
import { hasLinkedAccount, isAdminEmail } from "~/server/repos/customer-accounts.server";
import type { SignUpInput } from "~/server/contracts/account";

/** `<origin>/auth/confirm?next=<path>`: the hook rebuilds the emailed link from it (S-024 AC3). */
export function confirmRedirect(request: Request, next: string): string {
  return `${new URL(request.url).origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

/** A password nobody knows: 32 random bytes, base64url (43 characters, under GoTrue's 72). */
export function discardedPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function logAuthFailure(step: string) {
  console.error(JSON.stringify({ level: "error", event: "customer_auth_request_failed", step }));
}

/** RL-signup: 3 sign-ups (or Save my details) per hour per IP (S-206 AC6, S-215 AC7). */
export function consumeSignUp(args: GuardArgs, action: "customer.signUp" | "customer.saveDetails"): Promise<RateLimitResult> {
  return consumeRateLimit(args.context.get(requestDbContext).db, RL_SIGNUP, { action, parts: [clientIp(args.request)] }, args.context.get(clockContext).now());
}

/** At most one account email per address per minute; `false` = skip this one quietly (S-206 AC7). */
async function mayEmail(args: GuardArgs, email: string): Promise<boolean> {
  const db = args.context.get(requestDbContext).db;
  const result = await consumeRateLimit(db, RL_EMAIL_RESEND, { action: "customer.email", parts: [email] }, args.context.get(clockContext).now());
  return result.ok;
}

/** Sign-in link (S-208): only to an existing, non-admin address (`shouldCreateUser: false`). */
export async function sendSignInLink(args: GuardArgs, email: string, next: string): Promise<void> {
  const db = args.context.get(requestDbContext).db;
  if (await isAdminEmail(db, email)) return;
  if (!(await mayEmail(args, email))) return;
  // Unknown addresses are refused by Auth itself; that refusal is expected and not logged.
  await args.context.get(authContext).requestSignInLink(email, confirmRedirect(args.request, next));
}

/** Sign-up (S-206 AC1, AC4, AC5, AC7). Returns nothing: the page always says "Check your email". */
export async function signUpCustomer(args: GuardArgs, input: SignUpInput, next?: string): Promise<void> {
  const db = args.context.get(requestDbContext).db;
  if (await isAdminEmail(db, input.email)) return;
  if (!(await mayEmail(args, input.email))) return;
  const gateway = args.context.get(authContext);
  const ordersPage = next ?? localePath(input.locale, "/account/orders");
  if (await hasLinkedAccount(db, input.email)) {
    // The real owner already has an account: a sign-in email, not a second account (AC4).
    await gateway.requestSignInLink(input.email, confirmRedirect(args.request, ordersPage));
    return;
  }
  const ok = await gateway.signUp({
    email: input.email,
    password: discardedPassword(),
    metadata: { name: input.name, phone: input.phone, locale: input.locale },
    redirectTo: confirmRedirect(args.request, ordersPage),
  });
  if (!ok) logAuthFailure("sign_up");
}

/**
 * Save my details (S-215 AC2, AC4; threat-model G-01): an UNCONFIRMED account for the order's
 * email with a random discarded password, and the confirmation email. Nothing is linked and no
 * history is shown here: linking happens only when the email is confirmed (auth/confirm).
 * `in_use` when the address already has an account or is an admin's (the page offers sign-in).
 */
export async function saveDetailsAccount(args: GuardArgs, order: { email: string; name: string; phone: string; locale: Locale }): Promise<"sent" | "in_use"> {
  const db = args.context.get(requestDbContext).db;
  if ((await isAdminEmail(db, order.email)) || (await hasLinkedAccount(db, order.email))) return "in_use";
  if (!(await mayEmail(args, order.email))) return "sent";
  const ok = await args.context.get(authContext).signUp({
    email: order.email,
    password: discardedPassword(),
    metadata: { name: order.name, phone: order.phone, locale: order.locale, source: "save_details" },
    redirectTo: confirmRedirect(args.request, localePath(order.locale, "/account/orders")),
  });
  if (!ok) logAuthFailure("save_details");
  return "sent";
}

/** Password reset request (S-209 AC1): any non-admin address; the link lands on /account/reset. */
export async function requestCustomerReset(args: GuardArgs, email: string, locale: Locale): Promise<void> {
  const db = args.context.get(requestDbContext).db;
  if (await isAdminEmail(db, email)) return;
  if (!(await mayEmail(args, email))) return;
  const ok = await args.context.get(authContext).requestRecovery(email, confirmRedirect(args.request, localePath(locale, "/account/reset")));
  if (!ok) logAuthFailure("reset");
}
