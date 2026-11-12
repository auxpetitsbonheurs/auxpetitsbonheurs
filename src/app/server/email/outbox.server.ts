// The minimal outbox sender E-02 needs (S-028 AC2, AC3): one invitation email, sent after
// the request committed (the route defers it past the response, ctx.waitUntil). On success
// the row is `sent` and the link (plaintext token) leaves its payload; on failure or the
// 8 s timeout it stays `pending` with one more attempt and the failure kind, and Team shows
// "Email not sent, resend". E-10 adds the retrying cron and the daily cap (FR-074).
import { and, eq } from "drizzle-orm";
import { emailOutbox } from "~/db/schema";
import type { AdminRole } from "~/domain/admin-account";
import type { Executor } from "~/server/db.server";
import { INVITATION_TEMPLATE } from "~/server/repos/invitations.server";
import { EMAIL_TIMEOUT_MS, EmailSendError, type Mailer, sendWithTimeout } from "./sender.server";
import { invitationEmail } from "./templates.server";

/** A failed row is not picked up again before this (the E-10 cron honours `next_attempt_at`). */
export const RETRY_AFTER_MS = 15 * 60 * 1000;

export type DeliveryResult = "sent" | "failed" | "not_configured" | "skipped";

interface InvitationPayload {
  inviterName: string;
  role: AdminRole;
  expiresOn: string;
  link?: string;
}

async function recordFailure(db: Executor, id: string, attempts: number, kind: string, now: Date) {
  await db
    .update(emailOutbox)
    .set({ attempts: attempts + 1, lastError: kind, nextAttemptAt: new Date(now.getTime() + RETRY_AFTER_MS) })
    .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "pending")));
}

/**
 * Sends one pending invitation email. Never throws for a provider problem: the outcome is
 * recorded on the row (kind only, never the provider's text). `mailer` null = Resend is not
 * configured (ADR-0002 amendment): counted as a failed attempt so Team can say so.
 */
export async function deliverInvitation(
  db: Executor,
  mailer: Mailer | null,
  outboxId: string,
  options: { now: Date; timeoutMs?: number },
): Promise<DeliveryResult> {
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).limit(1);
  // Written by insertInvitation in this codebase only, so the shape is known.
  const payload = row?.payload as unknown as InvitationPayload | undefined;
  if (!row || row.status !== "pending" || row.template !== INVITATION_TEMPLATE || !payload?.link) return "skipped";
  if (!mailer) {
    await recordFailure(db, row.id, row.attempts, "not_configured", options.now);
    return "not_configured";
  }
  const rendered = invitationEmail(row.locale, { inviterName: payload.inviterName, role: payload.role, link: payload.link, expiresOn: payload.expiresOn });
  try {
    const sent = await sendWithTimeout(mailer, { to: row.toEmail, ...rendered, idempotencyKey: `outbox-${row.id}` }, options.timeoutMs ?? EMAIL_TIMEOUT_MS);
    const { link: _sentLink, ...scrubbed } = payload;
    await db
      .update(emailOutbox)
      .set({ status: "sent", sentAt: options.now, providerId: sent.id, attempts: row.attempts + 1, lastError: null, payload: scrubbed as Record<string, unknown> })
      .where(eq(emailOutbox.id, row.id));
    return "sent";
  } catch (error) {
    await recordFailure(db, row.id, row.attempts, error instanceof EmailSendError ? error.kind : "network", options.now);
    return "failed";
  }
}
