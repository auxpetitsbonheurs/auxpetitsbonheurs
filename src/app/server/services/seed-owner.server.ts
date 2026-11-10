// Creates the first Owner (FR-040, S-010). One-off, run by a person with
// `npm run seed:owner` (scripts/seed-owner.ts wires the real Supabase and DB).
// Inputs come from the environment at run time; nothing real is committed.
import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { admin, customer } from "~/db/schema";
import { authUsers } from "~/db/tables/supabase-auth";
import type { Database } from "~/server/db.server";

export interface OwnerAuthAdmin {
  createUser(user: {
    email: string;
    password: string;
    emailConfirm: true;
    name: string;
  }): Promise<{ id: string }>;
  /** Sets the password and confirms the email of an existing auth user (Admin API). */
  resetUser(id: string, changes: { password: string; emailConfirm: true }): Promise<void>;
}

export interface SeedOwnerConnection {
  auth: OwnerAuthAdmin;
  db: Database;
  close(): Promise<void>;
}

const inputSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  OWNER_EMAIL: z.email().transform((email) => email.toLowerCase()),
  OWNER_NAME: z.string().trim().min(1),
  OWNER_PASSWORD: z.string().min(10),
});

export type SeedOwnerInput = z.infer<typeof inputSchema>;

export class SeedOwnerError extends Error {}

/** Validates without touching the network; errors name variables, never values. */
export function parseSeedOwnerInput(env: Record<string, string | undefined>, argv: string[]): SeedOwnerInput {
  const result = inputSchema.safeParse(env, { reportInput: false });
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new SeedOwnerError(
      `Invalid or missing: ${names.join(", ")} (OWNER_PASSWORD needs 10 or more characters).`,
    );
  }
  if (result.data.APP_ENV === "production" && !argv.includes("--confirm-production")) {
    throw new SeedOwnerError("Refusing to seed production without --confirm-production.");
  }
  return result.data;
}

async function findExisting(db: Database, email: string) {
  const [owner] = await db.select().from(admin).where(eq(admin.email, email));
  const [authUser] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(sql`lower(${authUsers.email})`, email));
  const customerMatch = or(
    eq(sql`lower(${customer.email})`, email),
    authUser ? eq(customer.authUserId, authUser.id) : undefined,
  );
  const [customerRow] = await db.select({ id: customer.id }).from(customer).where(customerMatch);
  return { owner, authUser, isCustomer: Boolean(customerRow) };
}

/**
 * An auth user without an admin row (an interrupted run, or one created by
 * someone else) is only safe to promote once its password is the one the
 * operator just supplied and its email is confirmed; otherwise a prior holder
 * of that password could sign in as Owner.
 */
async function reuseAuthUser(auth: OwnerAuthAdmin, id: string, password: string) {
  await auth.resetUser(id, { password, emailConfirm: true });
  return { id };
}

export type SeedOwnerResult = "created" | "exists";

/** Idempotent: an existing Owner is left untouched (no password change). */
export async function seedOwner(input: SeedOwnerInput, { auth, db }: SeedOwnerConnection): Promise<SeedOwnerResult> {
  const email = input.OWNER_EMAIL;
  const existing = await findExisting(db, email);
  if (existing.owner?.role === "owner") return "exists";
  if (existing.owner) {
    throw new SeedOwnerError("This email is already an Admin; promote them to Owner in Team instead.");
  }
  if (existing.isCustomer) {
    throw new SeedOwnerError(
      "This email belongs to a customer account. An auth user is either an admin or a customer, never both; use another email.",
    );
  }
  const user = existing.authUser
    ? await reuseAuthUser(auth, existing.authUser.id, input.OWNER_PASSWORD)
    : await auth.createUser({ email, password: input.OWNER_PASSWORD, emailConfirm: true, name: input.OWNER_NAME });
  await db.insert(admin).values({ id: user.id, name: input.OWNER_NAME, email, role: "owner", active: true, locale: "en" });
  return "created";
}

function redactor(env: Record<string, string | undefined>) {
  const secrets = [env.OWNER_PASSWORD, env.SUPABASE_SERVICE_ROLE_KEY, env.DATABASE_URL].filter(
    (value): value is string => Boolean(value && value.length >= 4),
  );
  return (text: string) => secrets.reduce((out, secret) => out.split(secret).join("[redacted]"), text);
}

export interface RunSeedOwnerOptions {
  env: Record<string, string | undefined>;
  argv: string[];
  /** Called only after validation, so invalid input never reaches the network. */
  connect: (input: SeedOwnerInput) => SeedOwnerConnection;
  log: (line: string) => void;
}

/** CLI body: returns the process exit code. Every log line is redacted. */
export async function runSeedOwner({ env, argv, connect, log }: RunSeedOwnerOptions): Promise<number> {
  const redact = redactor(env);
  let connection: SeedOwnerConnection | undefined;
  try {
    const input = parseSeedOwnerInput(env, argv);
    connection = connect(input);
    const result = await seedOwner(input, connection);
    log(result === "exists" ? "Owner already exists; nothing changed." : `Owner created (${input.APP_ENV}).`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    log(redact(`seed:owner failed: ${message}`));
    return 1;
  } finally {
    await connection?.close();
  }
}
