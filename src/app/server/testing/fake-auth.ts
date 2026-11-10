// In-process stand-in for Supabase Auth in unit tests: users with passwords, and a
// session cookie that carries the user id and sign-in time (so tests can age a
// session with a fixed clock). Implements the same AuthGateway seam as the real adapter.
import { randomUUID } from "node:crypto";
import type { AuthClaims, AuthGateway } from "~/server/auth-gateway.server";
import { readCookie } from "~/lib/cookies";

export const FAKE_SESSION_COOKIE = "apb_fake_session";

export class FakeAuth {
  private readonly users = new Map<string, { id: string; password: string }>();
  /** Every sign-in attempt, by email (AC5: no attempt on invalid input). */
  readonly attempts: string[] = [];
  readonly signOuts: string[] = [];

  addUser(email: string, password: string, id: string = randomUUID()): string {
    this.users.set(email.toLowerCase(), { id, password });
    return id;
  }

  /** `name=value` for a session of `userId` that signed in at `signedInAt`. */
  sessionCookie(userId: string, signedInAt: Date): string {
    return `${FAKE_SESSION_COOKIE}=${userId}~${signedInAt.getTime()}`;
  }

  gateway(request: Request, signedInNow: () => Date = () => new Date("2026-11-10T08:00:00Z")): AuthGateway {
    const pending: string[] = [];
    let claims: AuthClaims | null | undefined;
    const fromCookie = (): AuthClaims | null => {
      const [userId, ms] = (readCookie(request, FAKE_SESSION_COOKIE) ?? "").split("~");
      return userId && ms ? { userId, signedInAt: new Date(Number(ms)) } : null;
    };
    return {
      signInWithPassword: async ({ email, password }) => {
        this.attempts.push(email);
        const user = this.users.get(email.toLowerCase());
        if (!user || user.password !== password) return null;
        claims = { userId: user.id, signedInAt: signedInNow() };
        pending.push(`${this.sessionCookie(user.id, claims.signedInAt)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
        return { userId: user.id };
      },
      claims: async () => (claims === undefined ? (claims = fromCookie()) : claims),
      signOut: async () => {
        const current = claims === undefined ? fromCookie() : claims;
        if (current) this.signOuts.push(current.userId);
        claims = null;
        pending.push(`${FAKE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
      },
      takeSetCookies: () => pending.splice(0, pending.length),
    };
  }
}
