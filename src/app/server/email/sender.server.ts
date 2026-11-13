// The minimal Resend adapter E-02 needs (S-024; E-10 adds retry, outbox delivery and the
// daily cap). One message, one HTTPS call, bounded by a timeout. Failures carry a kind
// only: never the provider's answer, which can echo the address or the key's name.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Sent as Resend's `Idempotency-Key`, so a retried call never sends twice. */
  idempotencyKey?: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

export type EmailFailure = "timeout" | "provider" | "network";

export class EmailSendError extends Error {
  readonly kind: EmailFailure;
  /** A refusal retrying cannot fix (a 4xx other than 429, e.g. an invalid address): the row goes dead at once. */
  readonly permanent: boolean;

  constructor(kind: EmailFailure, permanent = false) {
    super(`email not sent (${kind})`);
    this.name = "EmailSendError";
    this.kind = kind;
    this.permanent = permanent;
  }
}

/** The provider must answer within 8 seconds (S-024 AC5). */
export const EMAIL_TIMEOUT_MS = 8000;

/** Rejects with `EmailSendError("timeout")` when `send` takes longer than `timeoutMs`. */
export async function sendWithTimeout(mailer: Mailer, message: EmailMessage, timeoutMs = EMAIL_TIMEOUT_MS): Promise<{ id: string | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EmailSendError("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([mailer.send(message), timeout]);
  } catch (error) {
    throw error instanceof EmailSendError ? error : new EmailSendError("network");
  } finally {
    clearTimeout(timer);
  }
}

export interface ResendConfig {
  apiKey: string;
  from: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const RESEND_URL = "https://api.resend.com/emails";

export function resendMailer(config: ResendConfig): Mailer {
  const fetcher = config.fetch ?? globalThis.fetch;
  return {
    async send(message) {
      let response: Response;
      try {
        response = await fetcher(RESEND_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
          },
          body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
          signal: AbortSignal.timeout(config.timeoutMs ?? EMAIL_TIMEOUT_MS),
        });
      } catch (error) {
        throw new EmailSendError(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
      }
      if (!response.ok) {
        const permanent = response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408;
        throw new EmailSendError("provider", permanent);
      }
      const body = (await response.json().catch(() => ({}))) as { id?: unknown };
      return { id: typeof body.id === "string" ? body.id : null };
    },
  };
}
