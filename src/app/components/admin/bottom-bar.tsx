import { CakeSlice, CalendarDays, ClipboardList, Ellipsis, type LucideIcon, Sun } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useI18n } from "~/i18n/react";

interface BarItem {
  key: "today" | "orders" | "calendar" | "menu" | "more";
  href: string;
  icon: LucideIcon;
  /** Paths under this item besides its own (More holds its sub-pages). */
  section?: RegExp;
}

const ITEMS: BarItem[] = [
  { key: "today", href: "/admin", icon: Sun },
  { key: "orders", href: "/admin/orders?tab=review", icon: ClipboardList },
  { key: "calendar", href: "/admin/calendar", icon: CalendarDays },
  { key: "menu", href: "/admin/menu", icon: CakeSlice },
  { key: "more", href: "/admin/more", icon: Ellipsis, section: /^\/admin\/(gallery|customers|sales|profile|availability|settings|team)(\/|$)/ },
];

/** "page" on the item's own page, "true" inside its section (a More sub-page), else none. */
function currentState(item: BarItem, pathname: string): "page" | "true" | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  const base = item.href.split("?")[0]!;
  if (path === base) return "page";
  if (base !== "/admin" && path.startsWith(`${base}/`)) return "true";
  return item.section?.test(path) ? "true" : undefined;
}

/** The visible count on Orders: the real number up to 9, then "9+" (S-034 AC5). */
export function reviewDotLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/**
 * Count dot on Orders (S-034, design-system "with count dot"): a number, never colour alone,
 * on the icon's corner so the 44 px column and its label keep their size. The visible
 * number is hidden from screen readers, which hear "3 to review" with the link's name.
 */
function ReviewDot({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      data-review-dot=""
      className="absolute -top-1.5 left-[calc(50%+0.375rem)] inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-strong px-1 text-xs leading-none font-bold text-primary-foreground ring-2 ring-card"
    >
      {reviewDotLabel(count)}
    </span>
  );
}

/**
 * The one-handed bottom bar (FR-047, design-system "Admin one-handed patterns"): five
 * labelled places, fixed to the bottom on phones; static and wrapping below 20rem (200%
 * zoom) so it never covers content. Hidden while the on-screen keyboard or a full-screen
 * sheet is open (app.css, `data-bottom-bar`).
 */
export function AdminBottomBar({ toReview = 0 }: { toReview?: number }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={t("admin.nav.label")}
      data-bottom-bar=""
      className="z-40 border-t border-border bg-card min-[20rem]:fixed min-[20rem]:inset-x-0 min-[20rem]:bottom-0 min-[20rem]:pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-content flex-wrap">
        {ITEMS.map((item) => {
          const current = currentState(item, pathname);
          const Icon = item.icon;
          return (
            // Arbitrary values (no token fits): from 20rem columns share the width by label
            // length, so "Commandes" and "Aujourd'hui" fit unbroken at 320 px; below (200% zoom)
            // a 3.5rem basis wraps them into rows. 13 px labels sit between text-xs and text-sm
            // (design-system: 11 characters in a 75 px column at 375 px), 12 px below 22.5rem.
            <li key={item.key} className="flex min-w-11 flex-[1_1_3.5rem] min-[20rem]:flex-auto">
              <Link
                to={item.href}
                prefetch="intent"
                aria-current={current}
                data-active={current ? "" : undefined}
                className="relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 py-1 text-center text-xs leading-tight min-[22.5rem]:text-[0.8125rem] font-semibold text-muted-foreground transition-colors duration-(--motion-fast) hover:text-foreground data-active:text-primary-strong before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:rounded-full data-active:before:bg-primary-strong"
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-6 shrink-0" />
                  {item.key === "orders" && toReview > 0 && <ReviewDot count={toReview} />}
                </span>
                <span data-bar-label="" className="hyphens-auto [overflow-wrap:anywhere]">
                  {t(`admin.nav.${item.key}`)}
                </span>
                {/* After the label, so the link reads "Orders, 3 to review". */}
                {item.key === "orders" && toReview > 0 && <span className="sr-only">{`, ${t("admin.nav.toReview", { count: toReview })}`}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
