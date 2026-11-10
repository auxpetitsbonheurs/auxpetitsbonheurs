import { useI18n } from "~/i18n/react";

/** First focusable element on every page; visible when focused (S-007 AC1). */
export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:bg-background focus:px-5 focus:font-semibold focus:text-primary-strong focus:shadow-md"
    >
      {t("shell.skipToContent")}
    </a>
  );
}
