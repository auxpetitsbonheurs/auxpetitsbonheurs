import type { ReactNode } from "react";
import { Link } from "react-router";
import { SiteMenu } from "~/components/site/site-menu";
import { AccountLink, SiteNav } from "~/components/site/site-nav";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { BasketLink } from "./basket-link";

interface SiteHeaderProps {
  basketCount: number;
  languageSwitch?: ReactNode;
  /** The customer account page (E-11 S-207); without it no account icon (S-242 AC4). */
  accountHref?: string;
  /** This browser has a customer session (display hint): "My account" instead of "Sign in". */
  signedIn?: boolean;
}

/**
 * Customer top bar (S-007, brand v0.3; S-242, S-243): a burgundy band with a thin gold rule
 * beneath, cream text and a cream focus ring (the `band` utility). DOM order = visual order at
 * every width, so Tab follows what the eye sees:
 *
 * - Below 1024 px (phones, tablets): language switch, centred logo, basket, menu button. From
 *   18rem a 1fr/auto/1fr grid keeps the logo centred; narrower (200% zoom on a 320 px phone) the
 *   items wrap in the same order.
 * - From 1024 px: logo at the start, the 7-link nav in the centre, then language switch,
 *   account (when live) and basket at the end, as in the burgundy reference.
 *
 * The language switch is rendered in both places but only one is ever displayed (the other is
 * `display: none`, so it is not read or tabbed twice).
 */
export function SiteHeader({ basketCount, languageSwitch, accountHref, signedIn = true }: SiteHeaderProps) {
  const { t, locale } = useI18n();
  return (
    <header className="band border-b border-gold">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-2 min-[18rem]:grid min-[18rem]:grid-cols-[1fr_auto_1fr] md:px-6 lg:flex lg:flex-nowrap lg:gap-x-4">
        <div className="justify-self-start lg:hidden">{languageSwitch}</div>
        {/* Logo lockup (version 2 colours: cream script, gold mark), 52 px tall; 44 px below 23rem so it fits a 320 px phone. Its alt is the link's name. */}
        <Link to={localePath(locale, "/")} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md">
          <img src="/brand/logo-lockup-cream.svg" alt={t("shell.bakeryName")} width={221} height={88} className="h-11 w-auto min-[23rem]:h-13" />
        </Link>
        <SiteNav />
        <div className="flex items-center gap-1 justify-self-end lg:shrink-0 lg:gap-2">
          <div className="hidden lg:block">{languageSwitch}</div>
          {accountHref && (
            <div className="hidden lg:block">
              <AccountLink href={accountHref} signedIn={signedIn} />
            </div>
          )}
          <BasketLink href={localePath(locale, "/basket")} count={basketCount} />
          <nav aria-label={t("shell.primaryNav")} className="lg:hidden">
            <SiteMenu account={accountHref ? { href: accountHref, signedIn } : undefined} />
          </nav>
        </div>
      </div>
    </header>
  );
}
