// The action error envelope (contracts.md "Conventions", "Error codes"):
// `{ ok: false, error: { code, message, fields? } }` with the code's HTTP status.
// `message` and `fields` are localised for the page.
import { data } from "react-router";
import { DomainError } from "~/domain/errors";
import { t } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";

const STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ORDER_CHANGED: 409,
  INVALID_TRANSITION: 409,
  DATE_UNAVAILABLE: 409,
  PRICE_CHANGED: 409,
  PRODUCT_UNAVAILABLE: 409,
  SLUG_TAKEN: 409,
  /** Settings or availability saved from a stale page (S-056..S-059). */
  SETTINGS_CHANGED: 409,
  /** Invite or accept: the email already has an admin or customer account (S-028, S-029). */
  EMAIL_IN_USE: 409,
  /** changeRole / deactivate would leave no active Owner (S-031, S-032). */
  LAST_OWNER: 409,
  /** Invitation expired, revoked, accepted or malformed (S-029, S-030). */
  INVITE_INVALID: 410,
  /** Recovery link expired, used or missing (S-026); also the generic refusal of a reset. */
  LINK_EXPIRED: 410,
  BASKET_FULL: 422,
  UPLOAD_REJECTED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;

export interface ActionErrorBody {
  ok: false;
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}

export function isErrorCode(code: string): code is ErrorCode {
  return code in STATUS;
}

/** The envelope for `code`, plus any extra top-level body fields the contract names. */
export function actionError<Extra extends object = object>(
  code: ErrorCode,
  locale: Locale,
  options: { fields?: Record<string, string>; extra?: Extra; headers?: HeadersInit } = {},
) {
  const body = {
    ok: false as const,
    error: { code, message: t(`errors.codes.${code}`, locale), ...(options.fields ? { fields: options.fields } : {}) },
    ...(options.extra ?? ({} as Extra)),
  };
  return data(body, { status: STATUS[code], ...(options.headers ? { headers: options.headers } : {}) });
}

/** Maps a known DomainError to its envelope; anything else is rethrown (500 boundary). */
export function domainErrorResult(error: unknown, locale: Locale) {
  if (error instanceof DomainError && isErrorCode(error.code)) return actionError(error.code, locale);
  throw error;
}
