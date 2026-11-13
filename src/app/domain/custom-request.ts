// Custom cake requests and quotes (E-08, FR-028..FR-033; spec custom-requests-quotes.md).
// Pure rules shared by the form, the server and the admin sheet: field limits, the occasions
// list, where customer photos are stored, and when a quote can still be answered.
import type { OrderStatus } from "./status";
import { addDays } from "./time";
import { MAX_PHOTOS } from "./upload";

/** Form limits (contracts.md `site/custom-cake` submitCustomRequest). */
export const REQUEST_LIMITS = {
  servingsMin: 1,
  servingsMax: 500,
  cakeTextMax: 200,
  detailsMax: 2000,
  /** Free text fields without a contract limit (flavours, theme). */
  shortTextMax: 200,
  photos: MAX_PHOTOS,
  maxSourceMb: 10,
} as const;

/** Occasion keys (labels live in i18n `customRequest.occasions.*`); stored as the key. */
export const OCCASIONS = ["birthday", "wedding", "anniversary", "baby", "christening", "corporate", "other"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export function isOccasion(value: string): value is Occasion {
  return (OCCASIONS as readonly string[]).includes(value);
}

/** Quote limits (contracts.md `admin/order` sendQuote and decline). */
export const QUOTE_LIMITS = {
  amountMin: 1,
  amountMax: 1_000_000,
  noteMax: 1000,
  declineReasonMax: 500,
} as const;

/** The private bucket customer photos go to (migration 0001; admins read via signed URLs). */
export const REQUEST_PHOTOS_BUCKET = "request-photos";

/** How long an admin's signed read URL for a request photo lasts (spec: 10 minutes). */
export const REQUEST_PHOTO_URL_SECONDS = 600;

/** An unattached upload is removed after this (S-153 AC7). */
export const ORPHAN_UPLOAD_MS = 24 * 60 * 60 * 1000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const REQUEST_PHOTO_PATH = new RegExp(`^requests/(${UUID})/${UUID}\\.(webp|jpg|png)$`);

/** Where one form session's photos go: `requests/<uploadSessionId>/`. */
export function requestPhotoPrefix(uploadSessionId: string): string {
  return `requests/${uploadSessionId.toLowerCase()}/`;
}

/** True when `path` is exactly a request photo path of this form session (never another prefix). */
export function isRequestPhotoPath(path: string, uploadSessionId: string): boolean {
  const match = REQUEST_PHOTO_PATH.exec(path);
  return match !== null && match[1] === uploadSessionId.toLowerCase();
}

/** The expiry the send-quote sheet starts with (FR-030): today + Settings validity days. */
export function defaultQuoteExpiry(todayMu: string, validityDays: number): string {
  return addDays(todayMu, validityDays);
}

/** A quote is valid through 23:59:59 Mauritius time on its expiry date (FR-031). */
export function isQuoteExpired(expiresOn: string, todayMu: string): boolean {
  return todayMu > expiresOn;
}

/** Whether the customer may still answer: Quote sent and not past its expiry day. */
export function canRespondToQuote(status: OrderStatus, expiresOn: string | null, todayMu: string): boolean {
  return status === "quote_sent" && expiresOn !== null && !isQuoteExpired(expiresOn, todayMu);
}

/** A quote as stored: the whole price, the optional note and the last valid day. */
export interface QuoteSnapshot {
  amountRs: number;
  note: string | null;
  expiresOn: string;
}

/** One reference photo on the admin screen: a signed (or public gallery) URL, null when it could not be signed. */
export interface AdminRequestPhoto {
  url: string | null;
  fromGallery: boolean;
}

/** The custom request part of the admin order screen (E-08 S-155, S-156). */
export interface AdminRequestView {
  occasion: string | null;
  servings: number | null;
  flavours: string | null;
  theme: string | null;
  cakeText: string | null;
  budgetRs: number | null;
  details: string | null;
  quote: QuoteSnapshot | null;
  photos: AdminRequestPhoto[];
  /** The sheet's expiry: today + Settings quote validity (contracts.md `quoteDefaults`). */
  quoteDefaults: { expiresOn: string };
}
