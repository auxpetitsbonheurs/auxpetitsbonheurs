// Workshop events for E-15 tests: an event row and a registration through the real service.
import { randomUUID } from "node:crypto";
import { workshopEvent } from "~/db/schema";
import type { TestDatabase } from "~/db/testing/pglite";
import type { Locale } from "~/lib/locale";
import type { FlatForm } from "~/server/contracts/workshops";
import type { Database } from "~/server/db.server";
import { type RegisterContext, type RegisterResult, registerWorkshop } from "~/server/services/register-workshop.server";
import { NO_TURNSTILE } from "~/server/turnstile.server";

/** Thu 2026-11-05 08:00 UTC (12:00 in Mauritius); the event is on Sat 14 Feb 2027. */
export const WORKSHOP_NOW = "2026-11-05T08:00:00Z";
export const WORKSHOP_DATE = "2027-02-14";

export const CAKE_OPTIONS = [
  { id: "choc", name: { en: "Chocolate", fr: "Chocolat" } },
  { id: "rv", name: { en: "Red velvet", fr: "Red velvet" } },
];

type EventRow = typeof workshopEvent.$inferInsert;

/** A published Valentine's workshop for 10 cakes at Rs 1,500 (unless overridden); returns its id. */
export async function insertWorkshopEvent(database: TestDatabase, overrides: Partial<EventRow> = {}): Promise<string> {
  const [row] = await (database.db as unknown as Database)
    .insert(workshopEvent)
    .values({
      slug: `valentines-${randomUUID().slice(0, 6)}`,
      titleEn: "Valentine's cake workshop",
      titleFr: "Atelier gâteau de la Saint-Valentin",
      descriptionEn: "Decorate your own cake together.",
      descriptionFr: "Décorez votre gâteau à deux.",
      eventOn: WORKSHOP_DATE,
      startsAt: "14:00",
      endsAt: "16:30",
      address: "12 Rue Example, Beau Bassin",
      mapUrl: "https://maps.example.com/?q=bakery",
      priceRs: 1500,
      capacity: 10,
      cakeOptions: CAKE_OPTIONS,
      status: "published",
      ...overrides,
    })
    .returning({ id: workshopEvent.id });
  return row!.id;
}

/** A complete registration for 1 chocolate cake, allergies "None"; `overrides` replace or add fields (undefined removes one). */
export function registrationForm(eventId: string, overrides: Record<string, string | undefined> = {}): FlatForm {
  const form: FlatForm = {
    intent: "register",
    idempotencyKey: randomUUID(),
    eventId,
    "contact.name": "Aisha Test",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    cakes: "1",
    "cake.0": "choc",
    allergiesChoice: "none",
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete form[key];
    else form[key] = value;
  }
  return form;
}

export function registerContext(database: TestDatabase, options: Omit<Partial<RegisterContext>, "now"> & { now?: string; locale?: Locale } = {}): RegisterContext {
  return {
    db: database.db as unknown as Database,
    now: new Date(options.now ?? WORKSHOP_NOW),
    locale: options.locale ?? "en",
    ip: options.ip ?? `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
    turnstile: options.turnstile ?? NO_TURNSTILE,
    accountCustomerId: options.accountCustomerId ?? null,
  };
}

/** Registers through the service; throws unless it was placed. */
export async function registerTest(database: TestDatabase, eventId: string, overrides: Record<string, string | undefined> = {}, options: Parameters<typeof registerContext>[1] = {}): Promise<Extract<RegisterResult, { ok: true }>> {
  const result = await registerWorkshop(registrationForm(eventId, overrides), registerContext(database, options));
  if (!result.ok) throw new Error(`registration refused: ${result.code}`);
  return result;
}
