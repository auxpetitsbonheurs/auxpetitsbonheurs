// i18next-backed translator (architecture: i18n & locale). Isomorphic and synchronous:
// it is given one locale's already-merged messages (see catalog.server.ts), so the
// browser only ever receives the active locale. Plurals use Intl.PluralRules
// (French: 0 and 1 singular; English: 1 singular), keys `name_one` / `name_other`.
import i18next from "i18next";
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

export function createTranslator(locale: Locale, messages: Messages, options: TranslatorOptions = {}): Translate {
  const mode = options.mode ?? defaultMode();
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const i18n = i18next.createInstance();
  void i18n.init({
    initAsync: false,
    lng: locale,
    fallbackLng: false,
    resources: { [locale]: { translation: messages } },
    nsSeparator: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false }, // React escapes on render.
  });
  return (key, values) => {
    try {
      if (i18n.exists(key, values)) return i18n.t(key, values) as string;
    } catch {
      // Fall through to the key: a bad message must never break a page.
    }
    if (mode === "development") warn(`[i18n] missing ${locale} text for "${key}"`);
    return key;
  };
}
