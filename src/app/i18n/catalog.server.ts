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
