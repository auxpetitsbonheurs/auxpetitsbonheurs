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
}

export type PasswordUpdate = { ok: true } | { ok: false; reason: "weak" | "failed" };

/** Auth for ONE request: reads its cookies, collects the cookies to set on its response. */
export interface AuthGateway {
  /** Creates a session (cookies) for valid credentials; `null` for any refusal. */
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ userId: string } | null>;
  /** Verified claims of the request's session (refreshing it when due), or `null`. Memoised per request. */
  claims(): Promise<AuthClaims | null>;
  /** Ends this device's session and clears its cookies. */
  signOut(): Promise<void>;
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
}

export const authContext = createContext<AuthGateway>();
