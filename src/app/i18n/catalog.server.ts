// Both locale bundles live only on the server; pages receive one merged bundle
// through the root loader (S-006 AC5). FR falls back to EN per key, including
// blank or whitespace-only French text (NFR-007).
import type { Locale } from "~/lib/locale";
import en from "./en.json";
import fr from "./fr.json";
import { type Messages, type Translate, type TranslationValues, createTranslator } from "./translator";

function isBlank(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "";
}

function merge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isBlank(value)) continue;
    const current = out[key];
    out[key] =
      typeof value === "object" && typeof current === "object" ? merge(current, value) : value;
  }
  return out;
}

/** The active locale's messages with English filling any missing or blank French text. */
export function messagesFor(locale: Locale, english: Messages = en, french: Messages = fr): Messages {
  return locale === "fr" ? merge(english, french) : english;
}

/**
 * Namespaces the shared customer bundle leaves out: the admin app's text and the emails (server
 * only), and the account and review-form screens' text, which their own route layouts add
 * (`namespaceMessages`), so browsing pages do not carry it in their HTML (NFR-001, E-11/E-14).
 */
const NOT_FOR_CUSTOMERS = new Set(["admin", "email", "account", "reviewForm", "privacy"]);

/** One namespace of the active locale's messages (FR falls back to EN per key). */
export function namespaceMessages(locale: Locale, namespace: string): Messages {
  const value = messagesFor(locale)[namespace];
  return typeof value === "object" && value !== null ? { [namespace]: value } : {};
}
const customerBundles = new Map<Locale, Messages>();

/**
 * The messages a customer page ships (S-254, NFR-001): `messagesFor` without the admin and
 * email namespaces, about two thirds of the catalogue, which every page would otherwise carry
 * in its HTML. Admin pages (and their customer preview, under /admin) get the full bundle.
 */
export function customerMessagesFor(locale: Locale): Messages {
  let bundle = customerBundles.get(locale);
  if (!bundle) {
    bundle = Object.fromEntries(Object.entries(messagesFor(locale)).filter(([key]) => !NOT_FOR_CUSTOMERS.has(key)));
    customerBundles.set(locale, bundle);
  }
  return bundle;
}

const translators = new Map<Locale, Translate>();

/** Server-side translation (emails, meta, tests). Components use `useT()` instead. */
export function t(key: string, locale: Locale, values?: TranslationValues): string {
  let translate = translators.get(locale);
  if (!translate) {
    translate = createTranslator(locale, messagesFor(locale));
    translators.set(locale, translate);
  }
  return translate(key, values);
}
