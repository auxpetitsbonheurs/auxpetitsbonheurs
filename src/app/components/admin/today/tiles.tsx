import { useI18n } from "~/i18n/react";
import type { TodayLoaderData } from "~/routes/admin/home";

const TILES = [
  { key: "toReview", href: "/admin/orders?tab=review" },
  // Quote requests wait in To review (the list has no status filter).
  { key: "quotesToSend", href: "/admin/orders?tab=review" },
  { key: "awaitingPayment", href: "/admin/orders?tab=payment" },
  { key: "unpaid", href: "/admin/orders?tab=upcoming&paid=false" },
] as const;

/** Stat tiles (S-120 AC1, AC9): each a link named "To review: 3 orders" to the matching list. */
export function TodayTiles({ counts }: { counts: TodayLoaderData["counts"] }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("admin.today.tilesLabel")} className="mt-4">
      <ul className="grid grid-cols-1 gap-2 min-[20rem]:grid-cols-2 sm:grid-cols-4">
        {TILES.map(({ key, href }) => {
          const label = t(`admin.today.tile.${key}`);
          const count = counts[key];
          return (
            <li key={key}>
              <a
                href={href}
                aria-label={t("admin.today.tileName", { label, count })}
                className="flex min-h-11 flex-col rounded-card border-2 border-border bg-card p-3 hover:bg-accent"
              >
                <span className="text-sm font-semibold wrap-anywhere">{label}</span>
                <span className="text-3xl font-semibold tabular-nums" data-testid={`tile-${key}`}>
                  {count}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
