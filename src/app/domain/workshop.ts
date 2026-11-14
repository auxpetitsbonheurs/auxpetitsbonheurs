// Workshop events (E-15, ADR-0005; docs/specs/features/workshops.md). Pure rules shared by the
// customer pages, the admin screens and the services. A registration is one cake, shared by up
// to 2 people; places are cakes. A place is held while the registration's order is active
// (pending approval, awaiting payment, confirmed or completed); refused, cancelled and unpaid
// (cancelled by the 24 h job) registrations free theirs. The database procedure
// `register_workshop` applies the same rule under the event's lock.
import type { LocalizedText } from "~/db/tables/json-types";
import type { OrderStatus } from "./status";

export const WORKSHOP_STATUSES = ["draft", "published", "cancelled", "completed"] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];

/** Order statuses that do NOT hold a place (the rest do). */
export const FREED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["declined", "cancelled", "closed"]);

export const holdsPlace = (status: OrderStatus): boolean => !FREED_STATUSES.has(status);

/** People per cake, shown on the page ("up to 2 people per cake"). */
export const PEOPLE_PER_CAKE = 2;

export const WORKSHOP_LIMITS = {
  titleMax: 120,
  descriptionMax: 4000,
  addressMax: 300,
  mapUrlMax: 500,
  priceMax: 1_000_000,
  capacityMin: 1,
  capacityMax: 200,
  optionsMin: 1,
  optionsMax: 10,
  optionNameMax: 60,
  /** Cakes one registration may take (also never more than the places left). */
  cakesPerRegistrationMax: 10,
  peopleNamesMax: 300,
  allergiesMax: 500,
  messageMax: 1000,
  cancelReasonMax: 500,
} as const;

export function placesLeft(capacity: number, held: number): number {
  return Math.max(capacity - held, 0);
}

/** The most cakes the form offers: the places left, at most the per-registration cap. */
export function maxCakes(left: number): number {
  return Math.min(left, WORKSHOP_LIMITS.cakesPerRegistrationMax);
}

/** True while customers may register: published and its Mauritius date has not passed. */
export function isOpen(event: { status: string; eventOn: string }, today: string): boolean {
  return event.status === "published" && event.eventOn >= today;
}

/** "valentines-cake-workshop" from a title; accents dropped, at most 60 characters, never empty. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "workshop";
}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const isTime = (value: string): boolean => TIME.test(value);

/** "14:00–16:00" (EN) or "14 h 00 – 16 h 00" (FR). */
export function timeRange(startsAt: string, endsAt: string, locale: "en" | "fr"): string {
  if (locale === "fr") return `${startsAt.replace(":", " h ")} – ${endsAt.replace(":", " h ")}`;
  return `${startsAt}–${endsAt}`;
}

/** The text in `locale`, falling back to English (NFR-007). */
export function inLocale(en: string, fr: string | null | undefined, locale: "en" | "fr"): string {
  return locale === "fr" && fr && fr.trim() !== "" ? fr : en;
}

export function optionName(name: LocalizedText, locale: "en" | "fr"): string {
  return inLocale(name.en, name.fr, locale);
}

/** Cakes per chosen option, in the order the options were first chosen: `[{ optionId, quantity }]`. */
export function groupCakes(choices: readonly string[]): { optionId: string; quantity: number }[] {
  const counts = new Map<string, number>();
  for (const id of choices) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([optionId, quantity]) => ({ optionId, quantity }));
}
