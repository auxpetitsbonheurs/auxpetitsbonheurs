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
      className="inline-flex min-h-11 min-w-11 items-center rounded-md px-1.5 py-2 text-sm text-foreground underline underline-offset-4 hover:text-link-hover"
    >
      {t("language.other")}
    </a>
  );
}
