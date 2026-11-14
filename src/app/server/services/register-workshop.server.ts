// `site/workshop` register (E-15 S-303; contracts.md "Workshops"). In order, like the custom
// cake request: parse (every bad field at once) -> idempotent replay (a known key answers before
// any limit, so a retry after success never fails on a used Turnstile token) -> RL-request (its
// own count) -> Turnstile -> one CALL of `register_workshop` (migration 0026), which locks the
// event, checks it is open, the cake choices and the places left, and writes the order, its
// items, the registration, the event and the outbox rows. Never oversells (S-300 AC3).
import { sql } from "drizzle-orm";
import { formatOrderNumber, newTrackingToken } from "~/domain/order-number";
import { todayMU } from "~/domain/time";
import { groupCakes } from "~/domain/workshop";
import type { Locale } from "~/lib/locale";
import { type FlatForm, parseRegistration } from "~/server/contracts/workshops";
import type { Database } from "~/server/db.server";
import { RL_REQUEST, consumeRateLimit } from "~/server/rate-limit.server";
import type { TurnstileCheck } from "~/server/turnstile.server";

export interface RegisterContext {
  db: Database;
  now: Date;
  locale: Locale;
  ip: string;
  turnstile: TurnstileCheck;
  /** The signed-in customer's own row (from the session, never the form). */
  accountCustomerId?: string | null;
}

export type RegisterResult =
  | { ok: true; orderId: string; trackingToken: string; locale: Locale; orderNumber: string; replayed: boolean }
  | { ok: false; code: "VALIDATION_FAILED"; fields: string[]; keyReused?: true }
  | { ok: false; code: "WORKSHOP_CLOSED" }
  | { ok: false; code: "WORKSHOP_FULL"; placesLeft: number }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; code: "BOT_CHECK_FAILED" };

interface Existing {
  orderId: string;
  number: number;
  trackingToken: string;
  locale: Locale;
  contactEmail: string | null;
  orderNumberPrefix: string;
}

type ProcedureResult =
  | { kind: "existing"; existing: Existing }
  | { kind: "closed" }
  | { kind: "option" }
  | { kind: "full"; placesLeft: number }
  | { kind: "placed"; placed: Omit<Existing, "contactEmail"> };

async function call(db: Database, input: object): Promise<ProcedureResult> {
  const { rows } = (await db.execute(sql`call register_workshop(${JSON.stringify(input)}::jsonb, null)`)) as unknown as { rows: { result: ProcedureResult | string }[] };
  const result = rows[0]?.result;
  if (result === undefined) throw new Error("register_workshop returned no result");
  return typeof result === "string" ? (JSON.parse(result) as ProcedureResult) : result;
}

async function findByKey(db: Database, key: string): Promise<Existing | null> {
  const { rows } = (await db.execute(sql`
    select o.id as "orderId", o.number, o.tracking_token as "trackingToken", o.locale, o.contact_email as "contactEmail",
      coalesce(o.number_prefix, (select s.order_number_prefix from settings s where s.id = 1)) as "orderNumberPrefix"
    from orders o where o.idempotency_key = ${key}::uuid limit 1
  `)) as unknown as { rows: Existing[] };
  return rows[0] ?? null;
}

const sameEmail = (a: string, b: string | null) => b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The original registration for its own submitter, else a neutral refusal (threat-model G-21). */
function replay(existing: Existing, email: string): RegisterResult {
  if (!sameEmail(email, existing.contactEmail)) return { ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true };
  const { orderId, trackingToken, locale } = existing;
  return { ok: true, orderId, trackingToken, locale, orderNumber: formatOrderNumber(existing.orderNumberPrefix, existing.number), replayed: true };
}

export async function registerWorkshop(form: FlatForm, ctx: RegisterContext): Promise<RegisterResult> {
  const parsed = parseRegistration(form);
  if (!parsed.ok) return { ok: false, code: "VALIDATION_FAILED", fields: parsed.fields };
  const input = parsed.data;
  const existing = await findByKey(ctx.db, input.idempotencyKey);
  if (existing) return replay(existing, input.contact.email);
  const limited = await consumeRateLimit(ctx.db, RL_REQUEST, { action: "site.registerWorkshop", parts: [ctx.ip] }, ctx.now);
  if (!limited.ok) return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: limited.retryAfterSeconds };
  if ((await ctx.turnstile.verify(input.turnstileToken, ctx.ip)) !== "ok") return { ok: false, code: "BOT_CHECK_FAILED" };
  const result = await call(ctx.db, {
    idempotencyKey: input.idempotencyKey,
    eventId: input.eventId,
    today: todayMU(ctx.now),
    cakes: groupCakes(input.cakeChoices),
    peopleNames: input.peopleNames ?? null,
    allergies: input.allergiesChoice === "yes" ? (input.allergies ?? null) : null,
    order: {
      contactName: input.contact.name,
      contactPhone: input.contact.phone,
      contactEmail: input.contact.email,
      note: input.message ?? null,
      locale: ctx.locale,
      trackingToken: newTrackingToken(),
      policiesAcceptedAt: ctx.now.toISOString(),
      accountCustomerId: ctx.accountCustomerId ?? null,
    },
  });
  switch (result.kind) {
    case "existing":
      return replay(result.existing, input.contact.email);
    case "closed":
      return { ok: false, code: "WORKSHOP_CLOSED" };
    case "option":
      return { ok: false, code: "VALIDATION_FAILED", fields: input.cakeChoices.map((_, i) => `cake.${i}`) };
    case "full":
      return { ok: false, code: "WORKSHOP_FULL", placesLeft: result.placesLeft };
    case "placed": {
      const { orderId, trackingToken, locale, number, orderNumberPrefix } = result.placed;
      return { ok: true, orderId, trackingToken, locale, orderNumber: formatOrderNumber(orderNumberPrefix, number), replayed: false };
    }
  }
}
