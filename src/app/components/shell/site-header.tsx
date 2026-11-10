import type { ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { BasketLink } from "./basket-link";

/** Customer top bar: wordmark home link, language switch slot, basket link (S-007). */
export function SiteHeader({ basketCount, languageSwitch }: { basketCount: number; languageSwitch?: ReactNode }) {
  const { t, locale } = useI18n();
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:px-6">
        <Link
          to={localePath(locale, "/")}
          className="me-auto inline-flex min-h-11 min-w-11 items-center font-display text-xl font-semibold"
        >
          {t("shell.bakeryName")}
        </Link>
        {languageSwitch}
        <nav aria-label={t("shell.primaryNav")}>
          <BasketLink href={localePath(locale, "/basket")} count={basketCount} />
        </nav>
      </div>
    </header>
  );
}
