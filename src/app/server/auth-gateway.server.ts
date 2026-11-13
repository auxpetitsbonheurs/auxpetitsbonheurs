// The one seam between the app and Supabase Auth (architecture "Auth"). Routes and
// guards talk to this interface; workers/app.ts puts the Supabase-backed gateway for
// the current request in the context, unit tests put an in-process fake.
import { createContext } from "react-router";

export interface AuthClaims {
  userId: string;
  /** Sign-in time from the JWT `amr` claim; refreshes keep it, so it measures session age. */
  signedInAt: Date;
  /**
   * Set only when the session's latest authentication was a recovery link (`amr` method
   * `recovery`, or `otp` on Auth servers that report it so): when the link was used (S-026).
   */
  recoveredAt?: Date;
  /** The session user's email from the JWT (confirmed: Auth only issues sessions to proven addresses). */
  email?: string;
}

/** An emailed link's user once verified (E-11): what account linking needs, nothing more. */
export interface LinkUser {
  userId: string;
  email: string;
  /** `user_metadata` given at sign-up or Save my details (name, phone, locale); may be empty. */
  metadata: Record<string, unknown>;
}

/** The emailed links a customer can open (S-206 signup, S-208 magiclink, S-209 recovery). */
export type EmailLinkType = "signup" | "magiclink" | "recovery";

export type PasswordUpdate = { ok: true } | { ok: false; reason: "weak" | "failed" };

/** Auth for ONE request: reads its cookies, collects the cookies to set on its response. */
export interface AuthGateway {
  /** Creates a session (cookies) for valid credentials; `null` for any refusal. */
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ userId: string } | null>;
  /** Verified claims of the request's session (refreshing it when due), or `null`. Memoised per request. */
  claims(): Promise<AuthClaims | null>;
  /** Ends this device's session and clears its cookies. */
  signOut(): Promise<void>;
  /**
   * Ends every OTHER session of this request's user (refresh tokens revoked; this device
   * stays signed in). Lead decision 2026-11-12: a password change signs other devices out.
   * `false` when Auth refused or failed (the caller logs it; the password is changed anyway).
   */
  signOutOthers(): Promise<boolean>;
  /**
   * Ends EVERY session of this request's user, this device included (S-032: a deactivated
   * or revoked admin). Clears this device's cookies even when Auth refuses or fails; `false`
   * then (the caller logs it: the admin row already blocks access server-side).
   */
  signOutEverywhere(): Promise<boolean>;
  /** Set-Cookie values produced so far that are not yet on a response; returns each once. */
  takeSetCookies(): string[];
  /**
   * Asks Auth to email a recovery link for `email` that returns to `redirectTo` (S-025).
   * Sets no cookie. `false` when Auth refused or failed (the caller logs, never shows it).
   */
  requestRecovery(email: string, redirectTo: string): Promise<boolean>;
  /** Verifies a recovery link's `token_hash` and sets that session's cookies (S-026); `null` when expired or used. */
  verifyRecovery(tokenHash: string): Promise<{ userId: string } | null>;
  /** Sets the password of this request's session user (S-026, S-036). */
  updatePassword(password: string): Promise<PasswordUpdate>;
  /** Checks credentials without touching this request's session or cookies (S-036 current password). */
  checkPassword(credentials: { email: string; password: string }): Promise<boolean>;
  /**
   * Customer sign-up (S-206, threat-model G-01): creates an UNCONFIRMED user with the given
   * (random, discarded) password, or resends the confirmation for one still unconfirmed; Auth
   * emails the confirmation link back to `redirectTo`. Sets no cookie. `false` when Auth refused
   * or failed (the caller logs it and still answers like a success: no enumeration).
   */
  signUp(input: { email: string; password: string; metadata: Record<string, string>; redirectTo: string }): Promise<boolean>;
  /** Emails a one-time sign-in link to an EXISTING user only (`shouldCreateUser: false`, S-208). */
  requestSignInLink(email: string, redirectTo: string): Promise<boolean>;
  /** Verifies an emailed link's `token_hash` and sets that session's cookies; `null` when expired or used. */
  verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<LinkUser | null>;
}

export const authContext = createContext<AuthGateway>();

/**
 * After a password change: signs the user out of every other device. A failure is logged
 * (no user data) and never undoes the change: the new password already locks others out
 * at their next sign-in, and their access tokens lapse within the hour.
 */
export async function endOtherSessions(gateway: AuthGateway, where: string): Promise<void> {
  if (!(await gateway.signOutOthers())) console.error(JSON.stringify({ level: "error", event: "sign_out_others_failed", where }));
}
