// Customer account form contracts (E-11; contracts.md "Customer accounts"). Each parser returns
// the clean values or the problems by field, so pages can show a field message per problem.
import { normalizePhone } from "~/domain/phone";
import type { Locale } from "~/lib/locale";
import { emailProblem } from "./admin";
import { Email } from "./shared";

/** Password rules for customers (spec: min 10; GoTrue's bcrypt reads at most 72 bytes). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 80;

export type Problems<F extends string> = Partial<Record<F, string>>;
export type Parsed<T, F extends string> = { ok: true; value: T } | { ok: false; problems: Problems<F> };

const text = (form: Record<string, unknown>, name: string) => (typeof form[name] === "string" ? (form[name] as string).trim() : "");

/** The email field: `missing` / `format` problem keys, or the lower-cased address. */
export function parseEmail(form: Record<string, unknown>): Parsed<string, "email"> {
  const problem = emailProblem(form.email);
  if (problem) return { ok: false, problems: { email: problem === "missing" ? "account.common.emailMissing" : "account.common.emailFormat" } };
  return { ok: true, value: Email.parse(text(form, "email")) };
}

export const parseLocale = (raw: unknown): Locale => (raw === "fr" ? "fr" : "en");

export type SignUpField = "name" | "email" | "phone";
export interface SignUpInput {
  name: string;
  email: string;
  phone: string;
  locale: Locale;
}

/** `account/sign-up` signUp: name, email, phone (normalised +230), language; never a password (G-01). */
export function parseSignUp(form: Record<string, unknown>): Parsed<SignUpInput, SignUpField> {
  const problems: Problems<SignUpField> = {};
  const name = text(form, "name");
  if (name === "" || name.length > NAME_MAX) problems.name = "account.signUp.nameMissing";
  const email = parseEmail(form);
  if (!email.ok) Object.assign(problems, email.problems);
  const phone = normalizePhone(text(form, "phone"));
  if (!phone) problems.phone = "account.signUp.phoneFormat";
  if (Object.keys(problems).length > 0 || !email.ok || !phone) return { ok: false, problems };
  return { ok: true, value: { name, email: email.value, phone, locale: parseLocale(form.locale) } };
}

export type ProfileField = "name" | "phone";
export interface ProfileInput {
  name: string;
  phone: string;
  locale: Locale;
}

/** `account/profile` updateProfile (S-210): the email is the identity and is never read from the form. */
export function parseProfile(form: Record<string, unknown>): Parsed<ProfileInput, ProfileField> {
  const problems: Problems<ProfileField> = {};
  const name = text(form, "name");
  if (name === "" || name.length > NAME_MAX) problems.name = "account.profile.nameMissing";
  const phone = normalizePhone(text(form, "phone"));
  if (!phone) problems.phone = "account.profile.phoneFormat";
  if (!phone || Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, value: { name, phone, locale: parseLocale(form.locale) } };
}

/** A new password: 10..72 characters (S-206 AC3, S-209 AC3). */
export function passwordProblem(raw: unknown): string | undefined {
  const password = typeof raw === "string" ? raw : "";
  return password.length < PASSWORD_MIN || password.length > PASSWORD_MAX ? "account.reset.passwordShort" : undefined;
}

export type AddressField = "label" | "address" | "landmark";
export const ADDRESS_MAX = 500;
export const LABEL_MAX = 40;
export const LANDMARK_MAX = 200;

/** `account/addresses` add/update (S-211 AC2, AC6): label and address required, landmark optional. */
export function parseAddress(form: Record<string, unknown>): Parsed<{ label: string; address: string; landmark: string | null; isDefault: boolean }, AddressField> {
  const problems: Problems<AddressField> = {};
  const label = text(form, "label");
  const address = text(form, "address");
  const landmark = text(form, "landmark");
  if (label === "" || label.length > LABEL_MAX) problems.label = "account.addresses.errors.label";
  if (address === "" || address.length > ADDRESS_MAX) problems.address = "account.addresses.errors.address";
  if (landmark.length > LANDMARK_MAX) problems.landmark = "account.addresses.errors.landmark";
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  const isDefault = form.isDefault === "on" || form.isDefault === "true";
  return { ok: true, value: { label, address, landmark: landmark === "" ? null : landmark, isDefault } };
}
