// The action error envelope (contracts.md "Conventions", "Error codes"):
// `{ ok: false, error: { code, message, fields? } }` with the code's HTTP status.
// `message` and `fields` are localised for the page.
import { data } from "react-router";
import { DomainError } from "~/domain/errors";
import { t } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";

const STATUS = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  DATE_UNAVAILABLE: 409,
  PRICE_CHANGED: 409,
  PRODUCT_UNAVAILABLE: 409,
  BASKET_FULL: 422,
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
  options: { fields?: Record<string, string>; extra?: Extra } = {},
) {
  const body = {
    ok: false as const,
    error: { code, message: t(`errors.codes.${code}`, locale), ...(options.fields ? { fields: options.fields } : {}) },
    ...(options.extra ?? ({} as Extra)),
  };
  return data(body, { status: STATUS[code] });
}

/** Maps a known DomainError to its envelope; anything else is rethrown (500 boundary). */
export function domainErrorResult(error: unknown, locale: Locale) {
  if (error instanceof DomainError && isErrorCode(error.code)) return actionError(error.code, locale);
  throw error;
}
