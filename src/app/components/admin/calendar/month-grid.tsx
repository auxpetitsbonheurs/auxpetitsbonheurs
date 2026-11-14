import { Bike, Lock, Store } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router";
import { shiftMonth } from "~/domain/calendar";
import { addDays, formatWeekday } from "~/domain/time";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";
import type { CalendarLoaderData } from "~/routes/admin/calendar";
import { calendarHref } from "./header";

type Day = CalendarLoaderData["days"][number];

/** The cell's full name, one message per state so no translated fragments are joined (S-136 AC1, AC3, AC4). */
function useCellName() {
  const { t } = useI18n();
  return (day: Day) => {
    const total = day.delivery + day.pickup;
    const state = day.closedDay ? "Closed" : day.blocked ? "Blocked" : "";
    return total === 0 ? t(`admin.calendar.cell.none${state}`, { date: day.dayMonth }) : t(`admin.calendar.cell.counts${state}`, { date: day.dayMonth, pickup: day.pickup, delivery: day.delivery });
  };
}

const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * Arrow keys move day by day (focus only, roving tabindex), PageUp/PageDown open the previous or
 * next month, Enter opens the day (a link) (S-136 AC8). Focus stays inside the grid's dates.
 */
function useGridKeys(data: CalendarLoaderData) {
  const navigate = useNavigate();
  const first = data.weeks[0]![0]!;
  const last = data.weeks.at(-1)![6]!;
  const start = data.date >= first && data.date <= last ? data.date : `${data.month}-01`;
  const [focused, setFocused] = useState(start);
  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      void navigate(calendarHref("month", shiftMonth(data.month, event.key === "PageUp" ? -1 : 1)));
      return;
    }
    const step = KEY_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const target = addDays(focused, step);
    if (target < first || target > last) return;
    setFocused(target);
    event.currentTarget.querySelector<HTMLAnchorElement>(`a[data-date="${target}"]`)?.focus();
  };
  return { focused, setFocused, onKeyDown };
}

function Counts({ day }: { day: Day }) {
  const { t } = useI18n();
  const total = day.delivery + day.pickup;
  if (total === 0) return null;
  return (
    <>
      <span className="text-lg font-semibold tabular-nums md:hidden">{total}</span>
      <span className="hidden flex-wrap gap-x-2 text-sm md:flex">
        {day.delivery > 0 && (
          <span className="inline-flex items-center gap-1">
            <Bike aria-hidden="true" className="size-4" />
            <span className="tabular-nums">{day.delivery}</span>
            <span className="sr-only lg:not-sr-only">{t("admin.calendar.deliveryWord")}</span>
          </span>
        )}
        {day.pickup > 0 && (
          <span className="inline-flex items-center gap-1">
            <Store aria-hidden="true" className="size-4" />
            <span className="tabular-nums">{day.pickup}</span>
            <span className="sr-only lg:not-sr-only">{t("admin.calendar.pickupWord")}</span>
          </span>
        )}
      </span>
    </>
  );
}

function Cell({ day, data, focused, onFocus, name }: { day: Day; data: CalendarLoaderData; focused: boolean; onFocus: () => void; name: string }) {
  const { t } = useI18n();
  const inMonth = day.date.startsWith(data.month);
  const today = day.date === data.today;
  return (
    <td className="p-0.5 align-top">
      <a
        href={calendarHref("day", day.date)}
        data-date={day.date}
        tabIndex={focused ? 0 : -1}
        onFocus={onFocus}
        aria-label={name}
        aria-current={today ? "date" : undefined}
        className={cn(
          "flex min-h-14 w-full flex-col items-start gap-0.5 rounded-md border p-1 hover:bg-accent md:min-h-20",
          day.blocked || day.closedDay ? "border-border bg-muted text-muted-foreground" : "border-border bg-card",
          !inMonth && "opacity-70",
          today && "ring-2 ring-primary ring-offset-1",
        )}
      >
        <span className="flex w-full items-center justify-between gap-0.5">
          <span className={cn("tabular-nums", today && "font-bold")}>{Number(day.date.slice(8))}</span>
          {day.blocked && <Lock aria-hidden="true" className="size-3.5 shrink-0" />}
        </span>
        <Counts day={day} />
        {day.closedDay && <span className="hidden text-xs md:block">{t("admin.calendar.closedDay")}</span>}
      </a>
    </td>
  );
}

/** Month view (S-136): counts per day, blocked and closed days muted with a word or icon, today ringed. */
export function MonthGrid({ data }: { data: CalendarLoaderData }) {
  const { t, locale } = useI18n();
  const name = useCellName();
  const keys = useGridKeys(data);
  const byDate = new Map(data.days.map((day) => [day.date, day]));
  const empty = data.days.every((day) => !day.date.startsWith(data.month) || day.delivery + day.pickup === 0);
  return (
    <section aria-labelledby="calendar-period" className="mt-4">
      <p className="mb-2 text-sm">{t("admin.calendar.gridHint")}</p>
      <table onKeyDown={keys.onKeyDown} className="w-full table-fixed border-separate border-spacing-0" aria-labelledby="calendar-period">
        <thead>
          <tr>
            {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
              <th key={weekday} scope="col" className="pb-1 text-xs font-semibold">
                <abbr title={formatWeekday(weekday, locale)} className="no-underline">
                  {formatWeekday(weekday, locale, "short")}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((date) => {
                const day = byDate.get(date)!;
                return <Cell key={date} day={day} data={data} focused={keys.focused === date} onFocus={() => keys.setFocused(date)} name={name(day)} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {empty && <p className="mt-3 text-lg">{t("admin.calendar.emptyMonth")}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1">
          <Bike aria-hidden="true" className="size-4" />
          {t("admin.calendar.deliveryWord")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Store aria-hidden="true" className="size-4" />
          {t("admin.calendar.pickupWord")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Lock aria-hidden="true" className="size-4" />
          {t("admin.calendar.blockedWord")}
        </span>
      </p>
    </section>
  );
}
