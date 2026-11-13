// Translator (architecture: i18n & locale). Isomorphic and synchronous: it is given one
// locale's already-merged messages (see catalog.server.ts), so the browser only ever
// receives the active locale. Plurals use Intl.PluralRules (French: 0 and 1 singular;
// English: 1 singular), keys `name_one` / `name_other` (and `_many` where French needs it).
//
// A small local implementation of the i18next subset the catalogue uses (nested keys,
// `{{value}}` interpolation, `count` plurals), so every page stops shipping i18next
// (~14 kB gzipped, NFR-001 JS budget). translator.test.ts pins parity with i18next.
import type { Locale } from "~/lib/locale";

export interface Messages {
  [key: string]: string | Messages;
}

export type TranslationValues = Record<string, string | number>;
export type Translate = (key: string, values?: TranslationValues) => string;

export interface TranslatorOptions {
  /** development warns on missing keys; production stays silent. Never throws. */
  mode?: "development" | "production";
  warn?: (message: string) => void;
}

const defaultMode = (): "development" | "production" => (import.meta.env?.DEV ? "development" : "production");

/** The text at a dotted key path (a flat key containing dots also matches), else undefined. */
function lookup(messages: Messages, key: string): string | Messages | undefined {
  const flat = messages[key];
  if (flat !== undefined) return flat;
  let node: string | Messages | undefined = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

/** `{{ name }}` → the value; a placeholder with no value stays as written. */
function interpolate(text: string, values: TranslationValues | undefined): string {
  if (!values) return text;
  return text.replace(/\{\{([^{}]+)\}\}/g, (match, name: string) => {
    const value = values[name.trim()];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(locale: Locale, messages: Messages, options: TranslatorOptions = {}): Translate {
  const mode = options.mode ?? defaultMode();
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const plurals = new Intl.PluralRules(locale);
  return (key, values) => {
    const count = values?.count;
    const text =
      (typeof count === "number" ? lookup(messages, `${key}_${plurals.select(count)}`) : undefined) ??
      lookup(messages, key);
    // An empty text reads as its key (i18next returnEmptyString: false), without a warning.
    if (typeof text === "string") return text === "" ? key : interpolate(text, values);
    if (mode === "development") warn(`[i18n] missing ${locale} text for "${key}"`);
    return key;
  };
}
