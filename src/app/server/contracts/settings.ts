// Owner Settings and Availability inputs (contracts.md `SettingsInput`, `AvailabilityInput`,
// `addBlock`; S-056..S-059). The forms post flat names (`about.en`, `deliveryWindows.0.start`,
// repeated `closedWeekdays` and `featuredProductIds`); each parser checks every field so the
// page can mark all problems at once, and builds the typed input. Problems are short codes the
// page turns into sentences (`admin.settings.errors.*`, `admin.availability.errors.*`).
import { z } from "zod";
import {
  BLOCK_REASON_MAX,
  NOTICE_DAYS_LIMIT,
  WEEKDAYS,
  WINDOWS_MAX,
  WINDOWS_MIN,
  WINDOW_ID_PATTERN,
  WINDOW_LABEL_MAX,
  type WindowList,
  type WindowValue,
  isCalendarDate,
  minutesOf,
  overlappingWindows,
} from "~/domain/availability";
import { normalizePhone } from "~/domain/phone";
import {
  CAKE_MESSAGE_MAX,
  CAKE_MESSAGE_MIN,
  CONTENT_TEXT_MAX,
  DELIVERY_FEE_MAX_RS,
  FEATURED_MAX,
  HERO_TAGLINE_MAX,
  JUICE_NUMBER_MAX,
  type LocalizedValue,
  ORDER_PREFIX_PATTERN,
  PICKUP_ADDRESS_MAX,
  QUOTE_VALIDITY_MAX,
  QUOTE_VALIDITY_MIN,
  TIME_PATTERN,
  URL_MAX,
} from "~/domain/settings";
import { Email, Uuid, Version } from "./shared";

export type Problems = Record<string, string>;

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

/** A whole number in [min, max] typed as digits; null otherwise. */
function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^\d{1,7}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

/** http(s) only: a `javascript:` map link must never reach a customer page. */
function webUrl(raw: string): boolean {
  if (raw.length > URL_MAX || !z.url().safeParse(raw).success) return false;
  const protocol = new URL(raw).protocol;
  return protocol === "https:" || protocol === "http:";
}

function versionOf(form: FormData, problems: Problems): number {
  const version = Version.safeParse(form.get("version"));
  if (!version.success) problems.version = "invalid";
  return version.success ? version.data : 0;
}

// ---------------------------------------------------------------------------
// Settings (S-058 business, S-059 content)

export interface SettingsInput {
  deliveryFeeRs: number;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  juiceNumber: string | null;
  instagramUrl: string | null;
  quoteValidityDays: number;
  cakeMessageMax: number;
  eveningReminderAt: string;
  orderNumberPrefix: string;
  heroTagline: LocalizedValue | null;
  heroImagePath: string | null;
  featuredProductIds: string[];
  about: LocalizedValue | null;
  aboutImagePath: string | null;
  faq: LocalizedValue | null;
  policies: LocalizedValue | null;
  privacyNote: LocalizedValue | null;
}

export type SettingsForm =
  | { ok: true; version: number; input: SettingsInput; uploadSessionId: string | null }
  | { ok: false; problems: Problems };

function optionalChecked(form: FormData, name: string, problems: Problems, valid: (value: string) => boolean): string | null {
  const value = text(form, name);
  if (value === "") return null;
  if (!valid(value)) problems[name] = "invalid";
  return value;
}

function requiredNumber(form: FormData, name: string, min: number, max: number, problems: Problems): number {
  const value = wholeNumber(text(form, name), min, max);
  if (value === null) problems[name] = "invalid";
  return value ?? 0;
}

function requiredPattern(form: FormData, name: string, pattern: RegExp, problems: Problems): string {
  const value = text(form, name);
  if (!pattern.test(value)) problems[name] = "invalid";
  return value;
}

/** `{ en, fr }` or null when both are blank; French without English is refused. */
function localizedText(form: FormData, name: string, max: number, problems: Problems): LocalizedValue | null {
  const en = text(form, `${name}.en`);
  const fr = text(form, `${name}.fr`);
  if (en.length > max) problems[`${name}.en`] = "tooLong";
  if (fr.length > max) problems[`${name}.fr`] = "tooLong";
  if (en === "" && fr !== "") problems[`${name}.en`] = "missingEn";
  if (en === "" && fr === "") return null;
  return fr === "" ? { en } : { en, fr };
}

const imagePath = (form: FormData, name: string, problems: Problems) =>
  optionalChecked(form, name, problems, (value) => value.length <= 300 && !value.includes(".."));

function featuredIds(form: FormData, problems: Problems): string[] {
  const ids = form.getAll("featuredProductIds").map(String);
  if (ids.length > FEATURED_MAX) problems.featuredProductIds = "tooMany";
  else if (!ids.every((id) => Uuid.safeParse(id).success) || new Set(ids).size !== ids.length) problems.featuredProductIds = "invalid";
  return ids.map((id) => id.toLowerCase());
}

function businessFields(form: FormData, problems: Problems) {
  return {
    deliveryFeeRs: requiredNumber(form, "deliveryFeeRs", 0, DELIVERY_FEE_MAX_RS, problems),
    pickupAddress: optionalChecked(form, "pickupAddress", problems, (v) => v.length <= PICKUP_ADDRESS_MAX),
    pickupMapUrl: optionalChecked(form, "pickupMapUrl", problems, webUrl),
    contactPhone: optionalChecked(form, "contactPhone", problems, (v) => v.length <= 20 && normalizePhone(v) !== null),
    contactWhatsapp: optionalChecked(form, "contactWhatsapp", problems, (v) => v.length <= 20 && normalizePhone(v) !== null),
    contactEmail: optionalChecked(form, "contactEmail", problems, (v) => Email.safeParse(v).success)?.toLowerCase() ?? null,
    juiceNumber: optionalChecked(form, "juiceNumber", problems, (v) => v.length <= JUICE_NUMBER_MAX),
    instagramUrl: optionalChecked(form, "instagramUrl", problems, webUrl),
    quoteValidityDays: requiredNumber(form, "quoteValidityDays", QUOTE_VALIDITY_MIN, QUOTE_VALIDITY_MAX, problems),
    cakeMessageMax: requiredNumber(form, "cakeMessageMax", CAKE_MESSAGE_MIN, CAKE_MESSAGE_MAX, problems),
    eveningReminderAt: requiredPattern(form, "eveningReminderAt", TIME_PATTERN, problems),
    orderNumberPrefix: requiredPattern(form, "orderNumberPrefix", ORDER_PREFIX_PATTERN, problems),
  };
}

function contentFields(form: FormData, problems: Problems) {
  return {
    heroTagline: localizedText(form, "heroTagline", HERO_TAGLINE_MAX, problems),
    heroImagePath: imagePath(form, "heroImagePath", problems),
    featuredProductIds: featuredIds(form, problems),
    about: localizedText(form, "about", CONTENT_TEXT_MAX, problems),
    aboutImagePath: imagePath(form, "aboutImagePath", problems),
    faq: localizedText(form, "faq", CONTENT_TEXT_MAX, problems),
    policies: localizedText(form, "policies", CONTENT_TEXT_MAX, problems),
    privacyNote: localizedText(form, "privacyNote", CONTENT_TEXT_MAX, problems),
  };
}

/** Parses the Settings form (`save`). Every field is posted: unchanged ones as loaded. */
export function parseSettingsForm(form: FormData): SettingsForm {
  const problems: Problems = {};
  const version = versionOf(form, problems);
  const input: SettingsInput = { ...businessFields(form, problems), ...contentFields(form, problems) };
  const session = Uuid.safeParse(form.get("uploadSessionId"));
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, version, input, uploadSessionId: session.success ? session.data.toLowerCase() : null };
}

// ---------------------------------------------------------------------------
// Availability rules (S-056)

export interface AvailabilityInput {
  defaultNoticeDays: number;
  closedWeekdays: number[];
  deliveryWindows: WindowValue[];
  pickupWindows: WindowValue[];
}

export type AvailabilityForm = { ok: true; version: number; input: AvailabilityInput } | { ok: false; problems: Problems };

/** Row indexes posted for a list (`deliveryWindows.<i>.id`), in order; at most 20 read. */
function rowIndexes(form: FormData, list: WindowList): number[] {
  const indexes = new Set<number>();
  for (const key of form.keys()) {
    const match = new RegExp(`^${list}\\.(\\d{1,2})\\.`).exec(key);
    if (match) indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b).slice(0, 20);
}

function windowRow(form: FormData, name: string, problems: Problems): WindowValue {
  const id = text(form, `${name}.id`);
  const start = text(form, `${name}.start`);
  const end = text(form, `${name}.end`);
  const en = text(form, `${name}.label.en`);
  const fr = text(form, `${name}.label.fr`);
  if (!WINDOW_ID_PATTERN.test(id)) problems[`${name}.id`] = "invalid";
  if (en === "") problems[`${name}.label.en`] = "missing";
  else if (en.length > WINDOW_LABEL_MAX) problems[`${name}.label.en`] = "tooLong";
  if (fr.length > WINDOW_LABEL_MAX) problems[`${name}.label.fr`] = "tooLong";
  if (!TIME_PATTERN.test(start)) problems[`${name}.start`] = "time";
  if (!TIME_PATTERN.test(end)) problems[`${name}.end`] = "time";
  else if (TIME_PATTERN.test(start) && minutesOf(start) >= minutesOf(end)) problems[`${name}.end`] = "order";
  return { id, start, end, label: fr === "" ? { en } : { en, fr } };
}

function windowList(form: FormData, list: WindowList, problems: Problems): WindowValue[] {
  const windows = rowIndexes(form, list).map((index) => windowRow(form, `${list}.${index}`, problems));
  if (windows.length < WINDOWS_MIN) problems[list] = "none";
  else if (windows.length > WINDOWS_MAX) problems[list] = "tooMany";
  else if (new Set(windows.map((w) => w.id)).size !== windows.length) problems[list] = "invalid";
  else if (overlappingWindows(windows.filter((w) => !Number.isNaN(minutesOf(w.start)) && !Number.isNaN(minutesOf(w.end)))).length > 0) {
    problems[list] = "overlap";
  }
  return windows;
}

/** Parses the Availability rules form (`saveRules`). */
export function parseAvailabilityForm(form: FormData): AvailabilityForm {
  const problems: Problems = {};
  const version = versionOf(form, problems);
  const notice = wholeNumber(text(form, "defaultNoticeDays"), 0, NOTICE_DAYS_LIMIT);
  if (notice === null) problems.defaultNoticeDays = "invalid";
  const closed = form.getAll("closedWeekdays").map((value) => Number(value));
  if (!closed.every((day) => (WEEKDAYS as readonly number[]).includes(day)) || new Set(closed).size !== closed.length) problems.closedWeekdays = "invalid";
  else if (closed.length >= WEEKDAYS.length) problems.closedWeekdays = "allClosed";
  const deliveryWindows = windowList(form, "deliveryWindows", problems);
  const pickupWindows = windowList(form, "pickupWindows", problems);
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return {
    ok: true,
    version,
    input: { defaultNoticeDays: notice!, closedWeekdays: [...closed].sort((a, b) => a - b), deliveryWindows, pickupWindows },
  };
}

// ---------------------------------------------------------------------------
// Blocked dates (S-057)

export interface BlockInput {
  startsOn: string;
  endsOn: string;
  reason: string | null;
}

export function parseBlockForm(form: FormData): { ok: true; input: BlockInput } | { ok: false; problems: Problems } {
  const problems: Problems = {};
  const startsOn = text(form, "startsOn");
  const endsOn = text(form, "endsOn");
  const reason = text(form, "reason");
  if (startsOn === "") problems.startsOn = "missing";
  else if (!isCalendarDate(startsOn)) problems.startsOn = "invalid";
  if (endsOn === "") problems.endsOn = "missing";
  else if (!isCalendarDate(endsOn)) problems.endsOn = "invalid";
  else if (!problems.startsOn && endsOn < startsOn) problems.endsOn = "beforeStart";
  if (reason.length > BLOCK_REASON_MAX) problems.reason = "tooLong";
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, input: { startsOn, endsOn, reason: reason === "" ? null : reason } };
}

export const BlockIdInput = z.object({ id: Uuid });
