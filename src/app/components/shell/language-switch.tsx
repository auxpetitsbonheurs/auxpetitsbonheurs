import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";

/**
 * Link to the same page in the other language (S-008, FR-001). It is navigation,
 * so a plain link (works without JavaScript); its text is the other language's own
 * name, marked with that language for screen readers.
 */
export function LanguageSwitch({ href }: { href: string }) {
  const { t, locale } = useI18n();
  const other: Locale = locale === "fr" ? "en" : "fr";
  return (
    <a
      href={href}
      lang={other}
      hrefLang={other}
      className="inline-flex min-h-11 items-center rounded-full px-3 py-2 font-semibold text-primary-strong underline underline-offset-4"
    >
      {t("language.other")}
    </a>
  );
}
