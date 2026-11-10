// Makes an existing Supabase Auth user the active Owner, without the Owner running anything
// on a computer: the "make-owner" GitHub Actions workflow runs `npm run make:owner` with the
// environment's database URL. The Owner first creates the user in the Supabase dashboard
// (Authentication → Users → Add user → Create new user, Auto Confirm User on), so no
// password or service-role key passes through here. Idempotent. Output never contains the
// database URL. Shares the lookup with seed-owner (FR-040).
import { eq } from "drizzle-orm";
import { z } from "zod";
import { admin } from "~/db/schema";
import type { Database } from "~/server/db.server";
import { findExisting } from "./seed-owner.server";

export interface MakeOwnerConnection {
  db: Database;
  close(): Promise<void>;
}

const inputSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  OWNER_EMAIL: z.email().transform((email) => email.toLowerCase()),
  /** Optional display name; defaults to the part of the email before "@". */
  OWNER_NAME: z.string().trim().optional(),
});

export type MakeOwnerInput = z.infer<typeof inputSchema>;

export class MakeOwnerError extends Error {}

export type MakeOwnerResult = "created" | "activated" | "exists";

const NOT_FOUND =
  "No Supabase Auth user with this email. In the Supabase dashboard of this environment: Authentication → Users → Add user → Create new user, with the same email, a strong password and Auto Confirm User on. Then run this workflow again.";
const NOT_CONFIRMED =
  "This Supabase Auth user's email is not confirmed. Confirm it (Authentication → Users → the user → Confirm email), or delete it and create it again with Auto Confirm User on.";
const IS_CUSTOMER =
  "This email belongs to a customer account. An auth user is either an admin or a customer, never both; use another email.";

function parseInput(env: Record<string, string | undefined>): MakeOwnerInput {
  const result = inputSchema.safeParse(env, { reportInput: false });
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new MakeOwnerError(`Invalid or missing: ${names.join(", ")}.`);
  }
  return result.data;
}

export async function makeOwner(db: Database, input: Pick<MakeOwnerInput, "OWNER_EMAIL" | "OWNER_NAME">): Promise<MakeOwnerResult> {
  const email = input.OWNER_EMAIL;
  const existing = await findExisting(db, email);
  if (!existing.authUser) throw new MakeOwnerError(NOT_FOUND);
  if (!existing.authUser.emailConfirmedAt) throw new MakeOwnerError(NOT_CONFIRMED);
  if (existing.isCustomer) throw new MakeOwnerError(IS_CUSTOMER);
  const id = existing.authUser.id;
  if (existing.owner && existing.owner.id !== id) {
    throw new MakeOwnerError("An admin row with this email points at another auth user; fix it in the database before retrying.");
  }
  const [row] = await db.select().from(admin).where(eq(admin.id, id));
  if (row?.role === "owner" && row.active) return "exists";
  if (row) {
    await db.update(admin).set({ role: "owner", active: true, deactivatedAt: null }).where(eq(admin.id, id));
    return "activated";
  }
  const name = input.OWNER_NAME || email.slice(0, email.indexOf("@"));
  await db.insert(admin).values({ id, name, email, role: "owner", active: true, locale: "en" });
  return "created";
}

/** Error text with the database URL, and any other URL, removed. */
function safeMessage(error: unknown, databaseUrl: string | undefined): string {
  let text = error instanceof Error ? error.message : "unknown error";
  if (databaseUrl && databaseUrl.length >= 4) text = text.split(databaseUrl).join("[redacted]");
  return text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]");
}

export interface RunMakeOwnerOptions {
  env: Record<string, string | undefined>;
  /** Called only after validation, so invalid input never reaches the database. */
  connect: (input: MakeOwnerInput) => MakeOwnerConnection;
  log: (line: string) => void;
}

const MESSAGES: Record<MakeOwnerResult, string> = {
  created: "Owner created",
  activated: "Owner activated",
  exists: "Already the active Owner",
};

/** CLI body: returns the process exit code. */
export async function runMakeOwner({ env, connect, log }: RunMakeOwnerOptions): Promise<number> {
  let connection: MakeOwnerConnection | undefined;
  try {
    const input = parseInput(env);
    connection = connect(input);
    const result = await makeOwner(connection.db, input);
    log(`${MESSAGES[result]} on ${input.APP_ENV}${result === "exists" ? "; nothing changed" : ""}.`);
    return 0;
  } catch (error) {
    log(`make-owner failed: ${safeMessage(error, env.DATABASE_URL)}`);
    return 1;
  } finally {
    await connection?.close();
  }
}
