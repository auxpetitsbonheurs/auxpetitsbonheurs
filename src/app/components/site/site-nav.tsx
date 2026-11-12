import { UserRound } from "lucide-react";
import type { MouseEvent } from "react";
import { Link, useLocation } from "react-router";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { SITE_NAV_ITEMS, type SiteNavItem, currentNavKey } from "~/lib/site-nav";
import { cn } from "~/lib/utils";

interface NavLinksProps {
  /** `bar`: the laptop header row; `panel`: the phone menu's full-width rows. */
  variant: "bar" | "panel";
  /** Called when a link is chosen (the phone menu closes itself; `current` = the page already shown). */
  onChoose?: (event: MouseEvent<HTMLAnchorElement>, item: SiteNavItem, current: boolean) => void;
  className?: string;
}

const variants = {
  // One line per label at 1024 px even in French (S-242 AC2): 14 px, tight padding; 16 px from xl.
  bar: {
    list: "flex items-center justify-center gap-x-0.5 xl:gap-x-2",
    link: "min-h-11 px-2 text-sm whitespace-nowrap xl:px-2.5 xl:text-base",
  },
  // Rows >= 48 px with 8 px between them (S-243 AC2); long French labels wrap, never clip (AC7).
  panel: {
    list: "flex flex-col gap-2",
    link: "min-h-12 w-full px-3 py-2 font-heading text-2xl leading-tight",
  },
} as const;

/**
 * The 7 site links (FR-076) in the Owner's order, labels from `nav.items.*`, in the page's
 * language. The current page (including `/menu/:slug` for Our collection) has
 * `aria-current="page"` and a gold underline, so it is marked by more than colour (S-242 AC3).
 */
export function SiteNavLinks({ variant, onChoose, className }: NavLinksProps) {
  const { t, locale } = useI18n();
  const { pathname } = useLocation();
  const current = currentNavKey(pathname);
  const styles = variants[variant];
  return (
    <ul className={cn(styles.list, className)}>
      {SITE_NAV_ITEMS.map((item) => {
        const isCurrent = item.key === current;
        return (
          <li key={item.key}>
            <Link
              to={localePath(locale, item.path)}
              aria-current={isCurrent ? "page" : undefined}
              onClick={onChoose ? (event) => onChoose(event, item, isCurrent) : undefined}
              className={cn(
                "inline-flex items-center rounded-md text-current underline-offset-8 decoration-2 decoration-band-gold transition-colors duration-(--motion-fast) hover:text-link-hover",
                "aria-[current=page]:underline",
                styles.link,
              )}
            >
              {t(`nav.items.${item.key}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Laptop header navigation (S-242): a horizontal bar from 1024 px. Below that it is
 * `display: none`, so neither the links nor the landmark reach assistive tech twice (AC7);
 * the phone menu button stands in for it (S-243).
 */
export function SiteNav() {
  const { t } = useI18n();
  return (
    <nav aria-label={t("shell.primaryNav")} className="hidden min-w-0 flex-1 lg:block">
      <SiteNavLinks variant="bar" />
    </nav>
  );
}

/**
 * The account icon (S-242 AC4): rendered only when customer accounts exist (E-11 S-207 passes
 * the route), so it never links to a missing page. 44 px, named "My account".
 */
export function AccountLink({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <Link
      to={href}
      aria-label={t("nav.account")}
      className="inline-flex size-11 items-center justify-center rounded-md text-current transition-colors duration-(--motion-fast) hover:text-link-hover"
    >
      <UserRound aria-hidden="true" className="size-6" strokeWidth={1.75} />
    </Link>
  );
}
