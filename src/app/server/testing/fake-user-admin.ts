// In-process stand-in for the Supabase Auth Admin API (S-029): creating a user adds it to
// the FakeAuth (so it can sign in) and to the stub `auth.users` table (so the `admin` row's
// foreign key holds, as on Supabase where both live in one Postgres).
import type { TestDatabase } from "~/db/testing/pglite";
import type { CreateUserResult, UserAdmin } from "~/server/user-admin.server";
import type { FakeAuth } from "./fake-auth";

export class FakeUserAdmin implements UserAdmin {
  readonly created: { id: string; email: string; locale: string; name: string }[] = [];
  readonly deleted: string[] = [];
  /** Users banned now (S-032). */
  readonly banned = new Set<string>();
  /** Every ban / unban call, in order. */
  readonly banCalls: { userId: string; banned: boolean }[] = [];
  /** `setBanned` answers `false` while this is true (Auth down or slower than 5 s). */
  banFails = false;
  /** `deleteUser` answers `false` while this is true (Auth down or slower than 5 s; PRV-02). */
  deleteFails = false;
  /** Next createUser answers this failure. */
  failWith: "failed" | "weak" | null = null;
  /**
   * Next createUser "succeeds" but leaves no auth.users row, so inserting the admin row
   * fails on its foreign key (S-029 AC5: the Auth user must then be removed).
   */
  orphanNext = false;

  constructor(
    private readonly database: TestDatabase,
    private readonly auth: FakeAuth,
  ) {}

  async createUser({ email, password, name, locale }: { email: string; password: string; name: string; locale: string }): Promise<CreateUserResult> {
    if (this.failWith) return { ok: false, reason: this.failWith };
    const existing = await this.database.client.query("select 1 from auth.users where lower(email) = lower($1)", [email]);
    if (existing.rows.length > 0 || this.auth.hasUser(email)) return { ok: false, reason: "exists" };
    const id = this.auth.addUser(email, password);
    if (this.orphanNext) this.orphanNext = false;
    else await this.database.client.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
    this.created.push({ id, email, locale, name });
    return { ok: true, userId: id };
  }

  async setBanned(userId: string, banned: boolean): Promise<boolean> {
    this.banCalls.push({ userId, banned });
    if (this.banFails) return false;
    if (banned) this.banned.add(userId);
    else this.banned.delete(userId);
    return true;
  }

  async deleteUser(userId: string): Promise<boolean> {
    if (this.deleteFails) return false;
    await this.database.client.query("delete from auth.users where id = $1", [userId]);
    this.auth.removeUser(userId);
    this.deleted.push(userId);
    return true;
  }
}
