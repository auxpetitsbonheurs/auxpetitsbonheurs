// Custom cake requests for E-08 tests: a valid form and a submit through the real service.
import { randomUUID } from "node:crypto";
import type { TestDatabase } from "~/db/testing/pglite";
import type { Locale } from "~/lib/locale";
import type { RequestForm } from "~/server/contracts/custom-request";
import type { Database } from "~/server/db.server";
import { type CustomRequestContext, type PlacedRequest, submitCustomRequest } from "~/server/services/custom-request.server";
import { NO_TURNSTILE } from "~/server/turnstile.server";

/** Thu 2026-11-05 MU: with the seeded 3 days' notice, Thu 12 Nov is orderable (Sunday closed). */
export const REQUEST_NOW = "2026-11-05T08:00:00Z";
export const REQUEST_DATE = "2026-11-12";

/** A complete pickup request without photos; `overrides` replace or add fields (undefined removes one). */
export function requestForm(overrides: Record<string, string | string[] | undefined> = {}): RequestForm {
  const form: RequestForm = {
    intent: "submitCustomRequest",
    idempotencyKey: randomUUID(),
    uploadSessionId: randomUUID(),
    occasion: "birthday",
    date: REQUEST_DATE,
    fulfilment: "pickup",
    "windowId.pickup": "morning",
    servings: "20",
    flavours: "Chocolate and passion fruit",
    theme: "Jungle, green and gold",
    cakeText: "Happy 5th birthday Zoé",
    budgetRs: "4000",
    details: "Two tiers, a lion on top.",
    "contact.name": "Aisha Test",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete form[key];
    else form[key] = value;
  }
  return form;
}

export function requestContext(database: TestDatabase, options: Omit<Partial<CustomRequestContext>, "now"> & { now?: string; locale?: Locale } = {}): CustomRequestContext {
  return {
    db: database.db as unknown as Database,
    now: new Date(options.now ?? REQUEST_NOW),
    locale: options.locale ?? "en",
    ip: options.ip ?? `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
    turnstile: options.turnstile ?? NO_TURNSTILE,
    photos: options.photos ?? null,
  };
}

/** Submits a valid request (overrides as in requestForm) and returns the placed request. */
export async function submitTestRequest(database: TestDatabase, overrides: Record<string, string | string[] | undefined> = {}, options: Parameters<typeof requestContext>[1] = {}): Promise<PlacedRequest> {
  const result = await submitCustomRequest(requestForm(overrides), requestContext(database, options));
  if (!result.ok) throw new Error(`test request refused: ${JSON.stringify(result)}`);
  return result;
}
