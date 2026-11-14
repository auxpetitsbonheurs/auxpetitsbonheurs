import type { ReactNode } from "react";
import { Link } from "react-router";
import { SiteMenu } from "~/components/site/site-menu";
import { AccountLink, SiteNav } from "~/components/site/site-nav";
import { useI18n } from "~/i18n/react";
import { badgeImage } from "~/lib/brand";
import { localePath } from "~/lib/locale";
import { BasketLink } from "./basket-link";

const headerBadge = badgeImage("cream", 56);
const HEADER_BADGE_SIZES = "(min-width: 23rem) 56px, 48px";

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
        {/* The Owner's cream badge on the burgundy band: 48 px below 23rem (320 px phones), 56 px
            elsewhere (the band stays within 80 px, S-242 AC6). Badge only: it carries the name, and a
            wordmark beside it would not fit at 320 px. Its alt is the link's name. Not lazy: it is above the fold. */}
        <Link to={localePath(locale, "/")} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full">
          <img {...headerBadge} sizes={HEADER_BADGE_SIZES} alt={t("shell.logoHome")} width={56} height={56} decoding="async" className="size-12 min-[23rem]:size-14" data-site-logo />
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
