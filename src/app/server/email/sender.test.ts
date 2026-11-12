// S-024 AC5: the Resend adapter at the HTTP boundary (a fake fetch, no network).
import { describe, expect, test } from "vitest";
import { EmailSendError, resendMailer } from "./sender.server";

const MESSAGE = { to: "sarah@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi", idempotencyKey: "auth-hook-msg_1" };

describe("resendMailer", () => {
  test("posts one message with the key, the sender and the idempotency key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ id: "re-1" });
    }) as unknown as typeof globalThis.fetch;

    const sent = await resendMailer({ apiKey: "re_placeholder", from: "Bakery <a@example.com>", fetch }).send(MESSAGE);

    expect(sent).toEqual({ id: "re-1" });
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_placeholder");
    expect(headers["idempotency-key"]).toBe("auth-hook-msg_1");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ from: "Bakery <a@example.com>", to: ["sarah@example.com"] });
  });

  test("a refusal is a provider failure without the provider's text", async () => {
    const fetch = (async () => Response.json({ message: "API key re_placeholder is invalid" }, { status: 401 })) as unknown as typeof globalThis.fetch;

    const failure = await resendMailer({ apiKey: "re_placeholder", from: "a@example.com", fetch }).send(MESSAGE).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).kind).toBe("provider");
    expect((failure as Error).message).not.toContain("re_placeholder");
  });

  test("no answer within the timeout is a timeout failure", async () => {
    const fetch = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as unknown as typeof globalThis.fetch;

    const failure = await resendMailer({ apiKey: "k", from: "a@example.com", fetch, timeoutMs: 20 }).send(MESSAGE).catch((e: unknown) => e);

    expect((failure as EmailSendError).kind).toBe("timeout");
  });
});
