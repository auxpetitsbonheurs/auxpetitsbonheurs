// POST /hooks/supabase/send-email (S-024, contracts.md "Webhooks"): Supabase Auth asks the
// app to send its auth emails, so they go out in the admin's language through Resend.
// Signed (Standard Webhooks), idempotent on `webhook-id`, and every refusal is a 500
// `{ error: { http_code, message } }` with a fixed safe message (Supabase shows it).
import { and, eq } from "drizzle-orm";
import { emailOutbox } from "~/db/schema";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { HANDLED_ACTIONS, HookPayload, confirmLink, metadataLocale, nextFromRedirect, verifyWebhook } from "~/server/email/auth-hook.server";
import { emailContext } from "~/server/email/context.server";
import { EmailSendError, sendWithTimeout } from "~/server/email/sender.server";
import { recoveryEmail } from "~/server/email/templates.server";
import { findAdminById } from "~/server/repos/admins.server";
import type { Route } from "./+types/send-email";

const MAX_BODY_BYTES = 64 * 1024;

type Outcome = "sent" | "duplicate" | "bad_signature" | "not_configured" | "invalid" | "unsupported" | "bad_redirect" | "send_failed";

/** One line per delivery: the outcome and the webhook id only, never the address or the link. */
function log(outcome: Outcome, webhookId: string | null, detail?: string) {
  const level = outcome === "sent" || outcome === "duplicate" ? "info" : "error";
  console.log(JSON.stringify({ level, event: "auth_email_hook", outcome, webhookId, ...(detail ? { detail } : {}) }));
}

function failure(status: 401 | 500, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

const ok = () => Response.json({}, { headers: { "Cache-Control": "no-store" } });

/** Claims `webhook-id` (AC6); false when an earlier delivery already claimed it. */
async function claim(args: Route.ActionArgs, webhookId: string, to: string, locale: "en" | "fr"): Promise<boolean> {
  const rows = await args.context
    .get(requestDbContext)
    .db.insert(emailOutbox)
    // `dead` keeps the row away from the outbox retry job (it holds no link to send again).
    .values({ template: "auth.recovery", toEmail: to, locale, payload: {}, dedupeKey: `auth-hook:${webhookId}`, status: "dead", lastError: "sending" })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning({ id: emailOutbox.id });
  return rows.length > 0;
}

async function settle(args: Route.ActionArgs, webhookId: string, sent: { id: string | null } | null) {
  const db = args.context.get(requestDbContext).db;
  const key = eq(emailOutbox.dedupeKey, `auth-hook:${webhookId}`);
  // A failed send releases the claim, so Supabase (or the admin asking again) can retry.
  if (!sent) await db.delete(emailOutbox).where(and(key, eq(emailOutbox.status, "dead")));
  else await db.update(emailOutbox).set({ status: "sent", lastError: null, providerId: sent.id, sentAt: args.context.get(clockContext).now() }).where(key);
}

interface Delivery {
  webhookId: string;
  payload: HookPayload;
  siteUrl: string;
  next: string;
}

/** Signature (401), payload, type and redirect checks (500); the delivery when all pass. */
async function readDelivery(request: Request, secret: string, now: Date): Promise<Delivery | Response> {
  const webhookId = request.headers.get("webhook-id");
  const body = await request.text();
  const headers = { id: webhookId, timestamp: request.headers.get("webhook-timestamp"), signature: request.headers.get("webhook-signature") };
  if (body.length > MAX_BODY_BYTES || !(await verifyWebhook(secret, headers, body, now))) {
    log("bad_signature", webhookId);
    return failure(401, "Invalid signature.");
  }
  const parsed = HookPayload.safeParse(parseJson(body));
  if (!parsed.success || !webhookId) {
    log("invalid", webhookId);
    return failure(500, "Invalid payload.");
  }
  const type = parsed.data.email_data.email_action_type;
  if (!(HANDLED_ACTIONS as readonly string[]).includes(type)) {
    log("unsupported", webhookId, type.slice(0, 20));
    return failure(500, "unsupported");
  }
  // SITE_URL: the origin this Worker is served on (the hook URL points at it, deploy-keys.md section 2).
  const siteUrl = new URL(request.url).origin;
  const next = nextFromRedirect(parsed.data.email_data.redirect_to, siteUrl);
  if (!next) {
    log("bad_redirect", webhookId);
    return failure(500, "Redirect is not allowed.");
  }
  return { webhookId, payload: parsed.data, siteUrl, next };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function action(args: Route.ActionArgs) {
  const { request, context } = args;
  const config = context.get(emailContext);
  if (!config.hookSecret) {
    log("not_configured", request.headers.get("webhook-id"), "SUPABASE_AUTH_HOOK_SECRET");
    return failure(500, "Email hook is not configured.");
  }
  const delivery = await readDelivery(request, config.hookSecret, context.get(clockContext).now());
  if (delivery instanceof Response) return delivery;
  const { webhookId, payload, siteUrl, next } = delivery;
  if (!config.mailer) {
    log("not_configured", webhookId, "RESEND_API_KEY, EMAIL_FROM");
    return failure(500, "Email could not be sent.");
  }
  const admin = await findAdminById(context.get(requestDbContext).db, payload.user.id);
  const locale = metadataLocale(payload) ?? admin?.locale ?? "en";
  if (!(await claim(args, webhookId, payload.user.email, locale))) {
    log("duplicate", webhookId);
    return ok();
  }
  const email = recoveryEmail(locale, confirmLink(siteUrl, payload.email_data.token_hash, payload.email_data.email_action_type, next));
  try {
    const sent = await sendWithTimeout(config.mailer, { to: payload.user.email, ...email, idempotencyKey: `auth-hook-${webhookId}` }, config.timeoutMs);
    await settle(args, webhookId, sent);
    log("sent", webhookId);
    return ok();
  } catch (error) {
    await settle(args, webhookId, null);
    log("send_failed", webhookId, error instanceof EmailSendError ? error.kind : "unknown");
    return failure(500, "Email could not be sent.");
  }
}
