import { data } from "react-router";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";

/** Any unknown customer path: a 404 inside the page shell, so the language switch stays usable. */
export function loader() {
  return data(null, { status: 404 });
}

export function meta() {
  return [{ name: "robots", content: "noindex" }];
}

export default function NotFound() {
  const { t, locale } = useI18n();
  return (
    <>
      <h1>{t("errors.notFoundTitle")}</h1>
      <p className="mt-4 max-w-measure">{t("errors.notFoundBody")}</p>
      <p className="mt-6">
        <a
          href={localePath(locale, "/")}
          className="inline-flex min-h-11 items-center font-semibold text-primary-strong underline underline-offset-4"
        >
          {t("errors.backHome")}
        </a>
      </p>
    </>
  );
}
