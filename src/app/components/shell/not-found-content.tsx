import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";

/** The 404 page body inside the shell (unknown paths, hidden or unknown products). */
export function NotFoundContent() {
  const { t, locale } = useI18n();
  return (
    <>
      <h1>{t("errors.notFoundTitle")}</h1>
      <p className="mt-4 max-w-measure">{t("errors.notFoundBody")}</p>
      <p className="mt-6">
        <a
          href={localePath(locale, "/")}
          className="inline-flex min-h-11 items-center font-semibold link"
        >
          {t("errors.backHome")}
        </a>
      </p>
    </>
  );
}
