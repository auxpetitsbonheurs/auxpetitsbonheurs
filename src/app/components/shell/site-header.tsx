import type { ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { BasketLink } from "./basket-link";

/**
 * Customer top bar (S-007, brand v0.3): a burgundy band with a thin gold rule beneath, the
 * logo lockup, cream text and a cream focus ring (the `band` utility). Language switch at the start, the wordmark home
 * link centred, the basket link at the end. DOM order = visual order, so Tab goes
 * language → home → basket. From 18rem a 1fr/auto/1fr grid keeps the wordmark centred;
 * narrower (200% zoom on a 320 px phone) the three items wrap in the same order.
 */
export function SiteHeader({ basketCount, languageSwitch }: { basketCount: number; languageSwitch?: ReactNode }) {
  const { t, locale } = useI18n();
  return (
    <header className="band border-b border-gold">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-2 min-[18rem]:grid min-[18rem]:grid-cols-[1fr_auto_1fr] md:px-6">
        <div className="justify-self-start">{languageSwitch}</div>
        {/* Logo lockup (version 2 colours: cream script, gold mark), 52 px tall; 44 px below 23rem so it fits a 320 px phone. Its alt is the link's name. */}
        <Link to={localePath(locale, "/")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md">
          <img src="/brand/logo-lockup-cream.svg" alt={t("shell.bakeryName")} width={221} height={88} className="h-11 w-auto min-[23rem]:h-13" />
        </Link>
        <nav aria-label={t("shell.primaryNav")} className="justify-self-end">
          <BasketLink href={localePath(locale, "/basket")} count={basketCount} />
        </nav>
      </div>
    </header>
  );
}
