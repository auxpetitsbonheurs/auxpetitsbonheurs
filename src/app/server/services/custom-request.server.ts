// `site/custom-cake` actions (E-08 S-151, S-153, S-162; contracts.md v0.43).
//
// requestUploadUrls: signed upload URLs to the private `request-photos` bucket under the form
// session's prefix, each queued for removal in 24 h until an order takes it (S-153 AC1, AC7).
//
// submitCustomRequest, in order: parse (every bad field at once) -> photo count and prefixes
// -> idempotent replay (a known key answers before any limit, so a retry after success never
// fails on a used Turnstile token) -> RL-request -> Turnstile -> fresh Settings: window and date
// (same rules as checkout, FR-014) -> each photo object read back from Storage (magic number,
// type, size) -> one CALL of `submit_custom_request` (drizzle/0016), which also checks every
// path was issued and is unattached, and writes order, request, photos, event and outbox rows.
import { sql } from "drizzle-orm";
import { storagePurge } from "~/db/schema";
import type { TimeWindow } from "~/db/schema";
import { type AvailabilityRules, type DayReason, dayStatus } from "~/domain/availability";
import { ORPHAN_UPLOAD_MS, REQUEST_PHOTOS_BUCKET, isRequestPhotoPath, requestPhotoPrefix } from "~/domain/custom-request";
import { formatOrderNumber, newTrackingToken } from "~/domain/order-number";
import { todayMU } from "~/domain/time";
import { MAX_PHOTOS, UPLOAD_EXTENSIONS } from "~/domain/upload";
import type { Locale } from "~/lib/locale";
import { type CustomRequestInput, RequestUploadInput, type RequestForm, parseCustomRequest } from "~/server/contracts/custom-request";
import type { Database } from "~/server/db.server";
import { RL_REQUEST, RL_UPLOAD, consumeRateLimit } from "~/server/rate-limit.server";
import { readSiteSettings } from "~/server/repos/settings.server";
import type { RequestPhotoGateway, SignedUpload } from "~/server/storage.server";
import type { TurnstileCheck } from "~/server/turnstile.server";
import { isImageObject } from "./product-photos.server";

export interface CustomRequestContext {
  db: Database;
  now: Date;
  /** The page locale: stored on the order and used for its emails (S-151 AC6). */
  locale: Locale;
  ip: string;
  turnstile: TurnstileCheck;
  photos: RequestPhotoGateway | null;
}

type Refusal =
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; code: "BOT_CHECK_FAILED" | "UPLOAD_REJECTED" | "INTERNAL" };

export type UploadUrlsResult = { ok: true; uploads: SignedUpload[] } | { ok: false; code: "VALIDATION_FAILED" } | Refusal;

export interface PlacedRequest {
  ok: true;
  orderId: string;
  trackingToken: string;
  locale: Locale;
  orderNumber: string;
  replayed: boolean;
}

export type SubmitRequestResult =
  | PlacedRequest
  | { ok: false; code: "VALIDATION_FAILED"; fields: string[]; windows?: { delivery: TimeWindow[]; pickup: TimeWindow[] } }
  /** The key belongs to another submitter's request: nothing about it is revealed (threat-model G-21). */
  | { ok: false; code: "VALIDATION_FAILED"; fields: []; keyReused: true }
  | { ok: false; code: "DATE_UNAVAILABLE"; reason: DayReason; availability: AvailabilityRules }
  | Refusal;

/** Checks shared by both actions: RL class for this IP, then Turnstile. */
async function guard(ctx: CustomRequestContext, limit: typeof RL_REQUEST, action: string, token: string | undefined): Promise<Refusal | null> {
  const limited = await consumeRateLimit(ctx.db, limit, { action, parts: [ctx.ip] }, ctx.now);
  if (!limited.ok) return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: limited.retryAfterSeconds };
  if ((await ctx.turnstile.verify(token, ctx.ip)) !== "ok") return { ok: false, code: "BOT_CHECK_FAILED" };
  return null;
}

export async function requestUploadUrls(raw: unknown, ctx: CustomRequestContext): Promise<UploadUrlsResult> {
  const parsed = RequestUploadInput.safeParse(raw);
  if (!parsed.success) {
    // A wrong type, size or count is the contract's UPLOAD_REJECTED; anything else is malformed.
    const photoProblem = parsed.error.issues.some((issue) => issue.path[0] === "files");
    return photoProblem ? { ok: false, code: "UPLOAD_REJECTED" } : { ok: false, code: "VALIDATION_FAILED" };
  }
  const input = parsed.data;
  const refused = await guard(ctx, RL_UPLOAD, "site.requestUploadUrls", input.turnstileToken);
  if (refused) return refused;
  if (!ctx.photos) return { ok: false, code: "INTERNAL" };
  const prefix = requestPhotoPrefix(input.uploadSessionId);
  const paths = input.files.map((f) => `${prefix}${crypto.randomUUID()}.${UPLOAD_EXTENSIONS[f.type]}`);
  let uploads: SignedUpload[];
  try {
    uploads = await Promise.all(paths.map((path) => ctx.photos!.signUpload(REQUEST_PHOTOS_BUCKET, path)));
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "request_upload_sign_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return { ok: false, code: "INTERNAL" };
  }
  // Each issued path waits in the purge queue; submit_custom_request drops the rows it attaches.
  const dueAt = new Date(ctx.now.getTime() + ORPHAN_UPLOAD_MS);
  await ctx.db.insert(storagePurge).values(paths.map((path) => ({ bucket: REQUEST_PHOTOS_BUCKET, path, dueAt }))).onConflictDoNothing();
  return { ok: true, uploads };
}

interface ExistingRequest {
  orderId: string;
  number: number;
  trackingToken: string;
  locale: Locale;
  contactEmail: string | null;
  orderNumberPrefix: string;
}

type ProcedureResult =
  | { kind: "existing"; existing: ExistingRequest }
  | { kind: "rejected" }
  | { kind: "placed"; placed: { orderId: string; number: number; trackingToken: string; locale: Locale; orderNumberPrefix: string } };

async function callSubmit(db: Database, input: object): Promise<ProcedureResult> {
  const { rows } = (await db.execute(sql`call submit_custom_request(${JSON.stringify(input)}::jsonb, null)`)) as unknown as { rows: { result: ProcedureResult | string }[] };
  const result = rows[0]?.result;
  if (result === undefined) throw new Error("submit_custom_request returned no result");
  return typeof result === "string" ? (JSON.parse(result) as ProcedureResult) : result;
}

const sameEmail = (a: string, b: string | null) => b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The original request for its own submitter (normalised email), else a neutral refusal (G-21). */
function replay(existing: ExistingRequest, email: string): SubmitRequestResult {
  if (!sameEmail(email, existing.contactEmail)) return { ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true };
  const { orderId, trackingToken, locale } = existing;
  return { ok: true, orderId, trackingToken, locale, orderNumber: formatOrderNumber(existing.orderNumberPrefix, existing.number), replayed: true };
}

async function findByKey(db: Database, key: string): Promise<ExistingRequest | null> {
  const { rows } = (await db.execute(sql`
    select o.id as "orderId", o.number, o.tracking_token as "trackingToken", o.locale, o.contact_email as "contactEmail",
      coalesce(o.number_prefix, (select s.order_number_prefix from settings s where s.id = 1)) as "orderNumberPrefix"
    from orders o where o.idempotency_key = ${key}::uuid limit 1
  `)) as unknown as { rows: ExistingRequest[] };
  return rows[0] ?? null;
}

/** Photo count (with the gallery photo) and every path under this form session's prefix. */
function photoPathsProblem(input: CustomRequestInput): boolean {
  const count = input.photoPaths.length + (input.galleryPhotoId ? 1 : 0);
  return count > MAX_PHOTOS || input.photoPaths.some((path) => !isRequestPhotoPath(path, input.uploadSessionId));
}

/** Every uploaded photo is really there: a JPEG/PNG/WebP of at most 1 MB by its first bytes. */
async function photosStored(photos: RequestPhotoGateway, paths: string[]): Promise<boolean> {
  const objects = await Promise.all(paths.map((path) => photos.inspect(REQUEST_PHOTOS_BUCKET, path).catch(() => null)));
  return objects.every(isImageObject);
}

function procedureInput(input: CustomRequestInput, ctx: CustomRequestContext, window: TimeWindow) {
  const delivery = input.fulfilment === "delivery" ? input : undefined;
  const photos = [...(input.galleryPhotoId ? [{ galleryPhotoId: input.galleryPhotoId }] : []), ...input.photoPaths.map((path) => ({ path }))];
  return {
    idempotencyKey: input.idempotencyKey,
    bucket: REQUEST_PHOTOS_BUCKET,
    photos,
    order: {
      contactName: input.contact.name,
      contactPhone: input.contact.phone,
      contactEmail: input.contact.email,
      fulfilment: input.fulfilment,
      address: delivery?.address ?? null,
      landmark: delivery?.landmark ?? null,
      fulfilOn: input.date,
      window,
      locale: ctx.locale,
      trackingToken: newTrackingToken(),
      policiesAcceptedAt: ctx.now.toISOString(),
    },
    request: {
      occasion: input.occasion,
      servings: input.servings,
      flavours: input.flavours,
      theme: input.theme ?? null,
      cakeText: input.cakeText ?? null,
      budgetRs: input.budgetRs ?? null,
      details: input.details ?? null,
    },
  };
}

/** Window and date against fresh Settings, the same rules as the checkout's date picker. */
async function scheduleProblem(input: CustomRequestInput, ctx: CustomRequestContext): Promise<{ refusal: SubmitRequestResult } | { window: TimeWindow }> {
  const settings = await readSiteSettings(ctx.db);
  const windows = settings.checkout.windows;
  const window = windows[input.fulfilment].find((w) => w.id === input.windowId);
  if (!window) return { refusal: { ok: false, code: "VALIDATION_FAILED", fields: ["windowId"], windows } };
  const rules = settings.availability;
  const status = dayStatus(input.date, { today: todayMU(ctx.now), ...rules }, rules.defaultNoticeDays);
  if (status.reason) return { refusal: { ok: false, code: "DATE_UNAVAILABLE", reason: status.reason, availability: rules } };
  return { window };
}

export async function submitCustomRequest(form: RequestForm, ctx: CustomRequestContext): Promise<SubmitRequestResult> {
  const parsed = parseCustomRequest(form);
  if (!parsed.ok) return { ok: false, code: "VALIDATION_FAILED", fields: parsed.fields };
  const input = parsed.data;
  if (photoPathsProblem(input)) return { ok: false, code: "UPLOAD_REJECTED" };
  const existing = await findByKey(ctx.db, input.idempotencyKey);
  if (existing) return replay(existing, input.contact.email);
  const refused = await guard(ctx, RL_REQUEST, "site.submitCustomRequest", input.turnstileToken);
  if (refused) return refused;
  const schedule = await scheduleProblem(input, ctx);
  if ("refusal" in schedule) return schedule.refusal;
  if (input.photoPaths.length > 0) {
    if (!ctx.photos) return { ok: false, code: "INTERNAL" };
    if (!(await photosStored(ctx.photos, input.photoPaths))) return { ok: false, code: "UPLOAD_REJECTED" };
  }
  const result = await callSubmit(ctx.db, procedureInput(input, ctx, schedule.window));
  if (result.kind === "existing") return replay(result.existing, input.contact.email);
  if (result.kind === "rejected") return { ok: false, code: "UPLOAD_REJECTED" };
  const { orderId, trackingToken, locale, number, orderNumberPrefix } = result.placed;
  return { ok: true, orderId, trackingToken, locale, orderNumber: formatOrderNumber(orderNumberPrefix, number), replayed: false };
}
