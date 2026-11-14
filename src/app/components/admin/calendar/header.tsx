import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { shiftMonth } from "~/domain/calendar";
import { addDays } from "~/domain/time";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";
import type { CalendarLoaderData } from "~/routes/admin/calendar";

export type CalendarView = CalendarLoaderData["view"];

/** The address of a view: month by `?month`, week and day by `?date` (contracts.md `admin/calendar`). */
export function calendarHref(view: CalendarView, value: string): string {
  return view === "month" ? `/admin/calendar?month=${value.slice(0, 7)}` : `/admin/calendar?view=${view}&date=${value}`;
}

const navLink = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border-2 border-input bg-card px-2 font-semibold hover:bg-accent";

function stepHrefs(data: CalendarLoaderData): { prev: string; next: string } {
  if (data.view === "month") return { prev: calendarHref("month", shiftMonth(data.month, -1)), next: calendarHref("month", shiftMonth(data.month, 1)) };
  const step = data.view === "week" ? 7 : 1;
  return { prev: calendarHref(data.view, addDays(data.date, -step)), next: calendarHref(data.view, addDays(data.date, step)) };
}

/**
 * Title, Month/Week/Day switch and previous/next (S-136 AC6, S-137 AC9). The views are links to
 * their own address (work before JavaScript, back button, shareable), the current one marked
 * `aria-current`, as the Orders tabs do (S-111 note: links in a nav need no arrow keys).
 */
export function CalendarHeader({ data }: { data: CalendarLoaderData }) {
  const { t } = useI18n();
  const { prev, next } = stepHrefs(data);
  const heading = data.view === "month" ? data.monthLabel : data.view === "week" ? t("admin.calendar.weekOf", { date: data.days[0]!.label }) : data.days[0]!.longLabel;
  const unit = data.view;
  return (
    <header className="grid gap-3">
      <h1>{t("admin.nav.calendar")}</h1>
      <nav aria-label={t("admin.calendar.viewsLabel")}>
        <ul className="flex flex-wrap gap-1.5">
          {(["month", "week", "day"] as const).map((view) => (
            <li key={view}>
              <a
                href={calendarHref(view, data.date)}
                aria-current={data.view === view ? "page" : undefined}
                className={cn("inline-flex min-h-11 items-center rounded-md border-2 px-3 font-semibold", data.view === view ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-accent")}
              >
                {t(`admin.calendar.view.${view}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <a href={prev} className={navLink} aria-label={t(`admin.calendar.prev.${unit}`)}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </a>
        <h2 className="min-w-0 flex-1 text-h2 first-letter:uppercase wrap-anywhere" id="calendar-period" aria-live="polite">
          {heading}
        </h2>
        <a href={next} className={navLink} aria-label={t(`admin.calendar.next.${unit}`)}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </a>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={calendarHref(data.view, data.today)} className={navLink}>
          {t("admin.calendar.today")}
        </a>
        <a href="" className={navLink}>
          <RefreshCw aria-hidden="true" className="size-4" />
          {t("admin.calendar.refresh")}
        </a>
      </div>
    </header>
  );
}
