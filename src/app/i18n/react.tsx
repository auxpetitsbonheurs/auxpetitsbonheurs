import { type ReactNode, createContext, useContext, useMemo } from "react";
import type { Locale } from "~/lib/locale";
import { type Messages, type Translate, createTranslator } from "./translator";

interface I18n {
  locale: Locale;
  t: Translate;
}

interface I18nState extends I18n {
  messages: Messages;
}

const I18nContext = createContext<I18nState>({ locale: "en", t: (key) => key, messages: {} });

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages, t: createTranslator(locale, messages) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Adds namespaces a route layout loaded for its own screens (the account and review-form
 * text, E-11/E-14) to the page's messages, so the shared customer bundle stays small.
 */
export function ExtraMessages({ messages, children }: { messages: Messages | undefined; children: ReactNode }) {
  const parent = useContext(I18nContext);
  const merged = useMemo(() => ({ ...parent.messages, ...messages }), [parent.messages, messages]);
  return (
    <I18nProvider locale={parent.locale} messages={merged}>
      {children}
    </I18nProvider>
  );
}

/** The page's locale and translator. */
export function useI18n(): I18n {
  return useContext(I18nContext);
}
