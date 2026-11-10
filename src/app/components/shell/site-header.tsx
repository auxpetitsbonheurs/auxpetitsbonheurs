import type { ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { BasketLink } from "./basket-link";

/**
 * Customer top bar (S-007, brand D4): language switch at the start, the wordmark home
 * link centred, the basket link at the end. DOM order = visual order, so Tab goes
 * language → home → basket. From 18rem a 1fr/auto/1fr grid keeps the wordmark centred;
 * narrower (200% zoom on a 320 px phone) the three items wrap in the same order.
 */
export function SiteHeader({ basketCount, languageSwitch }: { basketCount: number; languageSwitch?: ReactNode }) {
  const { t, locale } = useI18n();
  return (
    <header className="bg-background">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-3 min-[18rem]:grid min-[18rem]:grid-cols-[1fr_auto_1fr] md:px-6">
        <div className="justify-self-start">{languageSwitch}</div>
        {/* Wordmark 22 px (mockup); 18 px below 23rem so it stays on one line on a 320 px phone. */}
        <Link
          to={localePath(locale, "/")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-center font-display text-lg leading-tight text-foreground no-underline min-[23rem]:text-wordmark"
        >
          {t("shell.bakeryName")}
        </Link>
        <nav aria-label={t("shell.primaryNav")} className="justify-self-end">
          <BasketLink href={localePath(locale, "/basket")} count={basketCount} />
        </nav>
      </div>
    </header>
  );
}
