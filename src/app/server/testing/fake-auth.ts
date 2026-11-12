// In-process stand-in for Supabase Auth in unit tests: users with passwords, and a
// session cookie that carries the user id and sign-in time (so tests can age a
// session with a fixed clock). Implements the same AuthGateway seam as the real adapter.
// A recovery session (S-026) is a cookie ending in `~recovery`.
import { randomUUID } from "node:crypto";
import type { AuthClaims, AuthGateway, PasswordUpdate } from "~/server/auth-gateway.server";
import { readCookie } from "~/lib/cookies";

export const FAKE_SESSION_COOKIE = "apb_fake_session";
const COOKIE_ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";

export class FakeAuth {
  private readonly users = new Map<string, { id: string; password: string }>();
  private readonly recoveryTokens = new Map<string, string>();
  /** Every sign-in attempt, by email (AC5: no attempt on invalid input). */
  readonly attempts: string[] = [];
  readonly signOuts: string[] = [];
  /** Users whose other devices were signed out (`signOutOthers`, password changes). */
  readonly otherSessionsEnded: string[] = [];
  /** Users signed out of every device (`signOutEverywhere`, S-032). */
  readonly everywhereSignOuts: string[] = [];
  /** Recovery emails asked for (S-025). */
  readonly recoveryRequests: { email: string; redirectTo: string }[] = [];
  /** Passwords set, by user id (S-026, S-036). */
  readonly passwordUpdates: { userId: string; password: string }[] = [];
  /** Makes `requestRecovery` and `updatePassword` fail like an unreachable Auth server. */
  failing = false;

  addUser(email: string, password: string, id: string = randomUUID()): string {
    this.users.set(email.toLowerCase(), { id, password });
    return id;
  }

  hasUser(email: string): boolean {
    return this.users.has(email.toLowerCase());
  }

  removeUser(id: string): void {
    for (const [email, user] of this.users) if (user.id === id) this.users.delete(email);
  }

  passwordOf(email: string): string | undefined {
    return this.users.get(email.toLowerCase())?.password;
  }

  /** `name=value` for a session of `userId` that signed in at `signedInAt`. */
  sessionCookie(userId: string, signedInAt: Date): string {
    return `${FAKE_SESSION_COOKIE}=${userId}~${signedInAt.getTime()}`;
  }

  /** `name=value` for a session made by a recovery link used at `recoveredAt`. */
  recoveryCookie(userId: string, recoveredAt: Date): string {
    return `${this.sessionCookie(userId, recoveredAt)}~recovery`;
  }

  /** A one-use recovery `token_hash` for `email`, as the emailed link carries it. */
  recoveryToken(email: string): string {
    const user = this.users.get(email.toLowerCase());
    if (!user) throw new Error(`no fake user ${email}`);
    const hash = randomUUID().replaceAll("-", "");
    this.recoveryTokens.set(hash, user.id);
    return hash;
  }

  gateway(request: Request, signedInNow: () => Date = () => new Date("2026-11-10T08:00:00Z")): AuthGateway {
    const pending: string[] = [];
    let claims: AuthClaims | null | undefined;
    const fromCookie = (): AuthClaims | null => {
      const [userId, ms, kind] = (readCookie(request, FAKE_SESSION_COOKIE) ?? "").split("~");
      if (!userId || !ms) return null;
      const signedInAt = new Date(Number(ms));
      return kind === "recovery" ? { userId, signedInAt, recoveredAt: signedInAt } : { userId, signedInAt };
    };
    const current = () => (claims === undefined ? (claims = fromCookie()) : claims);
    const startSession = (userId: string, recovery: boolean) => {
      const at = signedInNow();
      claims = recovery ? { userId, signedInAt: at, recoveredAt: at } : { userId, signedInAt: at };
      const cookie = recovery ? this.recoveryCookie(userId, at) : this.sessionCookie(userId, at);
      pending.push(`${cookie}; ${COOKIE_ATTRIBUTES}; Max-Age=2592000`);
    };
    return {
      signInWithPassword: async ({ email, password }) => {
        this.attempts.push(email);
        const user = this.users.get(email.toLowerCase());
        if (!user || user.password !== password) return null;
        startSession(user.id, false);
        return { userId: user.id };
      },
      claims: async () => current(),
      signOut: async () => {
        const session = current();
        if (session) this.signOuts.push(session.userId);
        claims = null;
        pending.push(`${FAKE_SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`);
      },
      signOutOthers: async () => {
        const session = current();
        if (!session || this.failing) return false;
        this.otherSessionsEnded.push(session.userId);
        return true;
      },
      signOutEverywhere: async () => {
        const session = current();
        if (session) this.signOuts.push(session.userId);
        const ended = session !== null && !this.failing;
        if (ended) this.everywhereSignOuts.push(session.userId);
        claims = null;
        pending.push(`${FAKE_SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`);
        return ended;
      },
      takeSetCookies: () => pending.splice(0, pending.length),
      requestRecovery: async (email, redirectTo) => {
        if (this.failing) return false;
        this.recoveryRequests.push({ email, redirectTo });
        return true;
      },
      verifyRecovery: async (tokenHash) => {
        const userId = this.recoveryTokens.get(tokenHash);
        if (!userId) return null;
        this.recoveryTokens.delete(tokenHash);
        startSession(userId, true);
        return { userId };
      },
      updatePassword: async (password): Promise<PasswordUpdate> => {
        const session = current();
        if (!session || this.failing) return { ok: false, reason: "failed" };
        const user = [...this.users.values()].find((candidate) => candidate.id === session.userId);
        if (!user) return { ok: false, reason: "failed" };
        if (user.password === password) return { ok: false, reason: "weak" };
        user.password = password;
        this.passwordUpdates.push({ userId: session.userId, password });
        return { ok: true };
      },
      checkPassword: async ({ email, password }) => this.users.get(email.toLowerCase())?.password === password,
    };
  }
}
