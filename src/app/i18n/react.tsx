import { type ReactNode, createContext, useContext, useMemo } from "react";
import type { Locale } from "~/lib/locale";
import { type Messages, type Translate, createTranslator } from "./translator";

interface I18n {
  locale: Locale;
  t: Translate;
}

const I18nContext = createContext<I18n>({ locale: "en", t: (key) => key });

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createTranslator(locale, messages) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The page's locale and translator. */
export function useI18n(): I18n {
  return useContext(I18nContext);
}
