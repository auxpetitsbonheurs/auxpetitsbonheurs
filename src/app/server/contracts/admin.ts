// Admin app action inputs (contracts.md "Admin app").
import { z } from "zod";
import { Email, Uuid, Version } from "./shared";

/** `admin/login` signIn. Field problems are reported per field; the password is never echoed. */
export const SignInInput = z.object({
  email: Email,
  password: z.string().min(1).max(1024),
});

export type SignInField = "email" | "password";

/** Which fields are wrong, and how: an empty email reads differently from a malformed one. */
export function signInProblems(form: Record<string, unknown>): Partial<Record<SignInField, "missing" | "format">> {
  const email = typeof form.email === "string" ? form.email.trim() : "";
  const password = typeof form.password === "string" ? form.password : "";
  const problems: Partial<Record<SignInField, "missing" | "format">> = {};
  if (email === "") problems.email = "missing";
  else if (!SignInInput.shape.email.safeParse(email).success) problems.email = "format";
  if (password === "" || password.length > 1024) problems.password = "missing";
  return problems;
}

/** `admin/order` approve: the version the page loaded (FR-054). */
export const ApproveInput = z.object({
  intent: z.literal("approve"),
  version: Version,
});

export const OrderId = Uuid;

/** `admin/orders` paging (contracts.md "Pagination"): default 30, max 100, opaque cursor. */
export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

export function pageLimit(raw: string | null): number {
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

/** Opaque cursor: base64url of the last order number shown. */
export function encodeCursor(number: number): string {
  return btoa(`n:${number}`).replace(/=+$/, "").replaceAll("+", "-").replaceAll("/", "_");
}

export function decodeCursor(raw: string | null): number | null {
  if (!raw || !/^[A-Za-z0-9_-]{1,40}$/.test(raw)) return null;
  try {
    const match = /^n:(\d{1,9})$/.exec(atob(raw.replaceAll("-", "+").replaceAll("_", "/")));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}
