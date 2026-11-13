// Checkout step 3 with JavaScript (S-087, FR-013, FR-014): a calendar of the 90 days that
// explains every day it cannot offer. Lazy-loaded after hydration; the server-rendered native
// date field stands in until then (and without JavaScript). The rules are the same module
// placeOrder re-checks with (domain/availability.ts), so a day offered is a day accepted.
//
// Keyboard (APG date grid): arrows move by day and week, Home/End to the week's ends,
// PageUp/PageDown by month, Enter or Space chooses. Unavailable days stay focusable and say
// why, in their name and under the calendar (never by colour alone: struck through).
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import type { BasketDates, DayStatus } from "~/domain/availability";
import { addDays, formatDayLabel, formatMonthYear, formatWeekday, formatWeekdayDayMonth, isoWeekday } from "~/domain/time";
import { useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";
import { type Locale, localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { monthOf, monthWeeks, monthsBetween, nextFocus, reasonText } from "./date-picker-model";

export interface DatePickerProps {
  /** `basketDates(...)` with the items' names in the page language. */
  dates: BasketDates<string>;
  today: string;
  /** The date posted before (a refusal) or chosen before a re-render: kept even when no longer available. */
  initial?: string;
  error?: string;
  whatsapp: string | null;
}

type T = ReturnType<typeof useI18n>["t"];

/** Every date the grid may show a status for: the 90 days, past days and days past the horizon. */
function statusOf(date: string, byDate: Map<string, DayStatus>, today: string): DayStatus {
  return byDate.get(date) ?? { date, available: false, reason: date < today ? "too_soon" : "too_far" };
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function NoDates({ dates, whatsapp }: Pick<DatePickerProps, "dates" | "whatsapp">) {
  const { t, locale } = useI18n();
  // A seasonal item whose window the horizon cannot reach is the usual cause: name it.
  const season = dates.days.every((d) => d.reason === "out_of_season" || d.reason === "closed" || d.reason === "too_soon") ? dates.seasons[0] : undefined;
  return (
    <div className="mt-4 rounded-card border-2 border-info bg-card p-3 min-[20rem]:p-4">
      <p className="font-semibold">{t("checkout.dates.noDates")}</p>
      {season && <p className="mt-1">{t("checkout.dates.noDatesSeason", { item: season.name, start: formatDayLabel(season.startsOn, locale), end: formatDayLabel(season.endsOn, locale) })}</p>}
      <p className="mt-3">
        {whatsapp ? (
          <Button asChild variant="outline">
            <a href={whatsappHref(whatsapp, t("checkout.dates.whatsappText"))}>
              <MessageCircle aria-hidden="true" />
              {t("checkout.dates.whatsapp")}
            </a>
          </Button>
        ) : (
          <a href={localePath(locale, "/contact")} className="inline-flex min-h-11 items-center font-semibold link">
            {t("checkout.dates.contact")}
          </a>
        )}
      </p>
    </div>
  );
}

interface DayCellProps {
  day: DayStatus;
  label: string;
  focusable: boolean;
  tabbable: boolean;
  selected: boolean;
  /** The day whose reason the line under the calendar explains (tapped or focused). */
  explained: boolean;
  onPick: (date: string) => void;
  onFocusDay: (date: string) => void;
  onKey: (event: KeyboardEvent<HTMLElement>, date: string) => void;
}

function DayCell({ day, label, focusable, tabbable, selected, explained, onPick, onFocusDay, onKey }: DayCellProps) {
  const { locale } = useI18n();
  return (
    <td
      role="gridcell"
      data-date={day.date}
      id={tabbable ? "date" : undefined}
      tabIndex={focusable ? (tabbable ? 0 : -1) : undefined}
      aria-selected={focusable ? selected : undefined}
      aria-disabled={day.available ? undefined : true}
      onClick={() => onPick(day.date)}
      onFocus={() => onFocusDay(day.date)}
      onKeyDown={focusable ? (event) => onKey(event, day.date) : undefined}
      className="block cursor-pointer rounded-md p-0 text-center min-[20rem]:table-cell"
    >
      <span
        aria-hidden="true"
        className={cn(
          "mx-auto flex size-11 flex-col items-center justify-center rounded-full border-2 border-transparent leading-none",
          day.available ? "font-semibold text-foreground hover:bg-accent" : "text-muted-foreground line-through decoration-2",
          explained && !selected && "border-dashed border-muted-foreground",
          selected && "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
        )}
      >
        {/* The weekday shows only in the narrow list (200% zoom), where there are no column headers. */}
        <span className="text-xs font-normal no-underline min-[20rem]:hidden">{formatWeekday(isoWeekday(day.date), locale, "short")}</span>
        {Number(day.date.slice(8))}
      </span>
      <span className="sr-only">{label}</span>
    </td>
  );
}

/** The spoken name of a day: its date, and, when it cannot be chosen, why. */
function dayLabel(day: DayStatus, selected: boolean, reason: string, t: T, locale: Locale): string {
  const date = formatWeekdayDayMonth(day.date, locale);
  if (!day.available) return t("checkout.dates.unavailableLabel", { date, reason });
  return selected ? t("checkout.dates.selectedLabel", { date }) : date;
}

/** The line under the calendar: the focused day's reason, else the choice (or why it no longer works). */
function messageFor(shown: DayStatus | null, selected: DayStatus | null, reason: (d: DayStatus) => string, t: T, locale: Locale) {
  // The chosen day itself turned unavailable (a refusal, a basket change): say so, not just why.
  if (selected && !selected.available && (!shown || shown.date === selected.date)) {
    return { tone: "warning", text: t("checkout.dates.selectedUnavailable", { date: formatDayLabel(selected.date, locale), reason: reason(selected) }) } as const;
  }
  if (shown && !shown.available) return { tone: "info", text: t("checkout.dates.dayReason", { date: formatDayLabel(shown.date, locale), reason: reason(shown) }) } as const;
  if (selected && !selected.available) return { tone: "warning", text: t("checkout.dates.selectedUnavailable", { date: formatDayLabel(selected.date, locale), reason: reason(selected) }) } as const;
  if (selected) return { tone: "ok", text: t("checkout.dates.selected", { date: formatDayLabel(selected.date, locale) }) } as const;
  return { tone: "hint", text: t("checkout.dates.chooseHint") } as const;
}

function useCalendar(dates: BasketDates<string>, today: string, initial: string | undefined) {
  const first = today;
  const last = addDays(today, dates.days.length - 1);
  const inRange = (date: string | undefined): date is string => !!date && date >= first && date <= last;
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const [focus, setFocus] = useState<string>(inRange(initial) ? initial : (dates.earliest ?? first));
  const [month, setMonth] = useState(monthOf(focus));
  const [shown, setShown] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  return { first, last, selected, setSelected, focus, setFocus, month, setMonth, shown, setShown, announcement, setAnnouncement };
}

export default function DatePicker({ dates, today, initial, error, whatsapp }: DatePickerProps) {
  const { t, locale } = useI18n();
  const cal = useCalendar(dates, today, initial);
  const grid = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(false);
  const byDate = useMemo(() => new Map(dates.days.map((d) => [d.date, d])), [dates.days]);
  const months = useMemo(() => monthsBetween(cal.first, cal.last), [cal.first, cal.last]);
  const reason = (day: DayStatus) => reasonText(day, dates, today, t, locale);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-date="${cal.focus}"]`)?.focus();
  }, [cal.focus]);

  if (dates.earliest === null) return <NoDates dates={dates} whatsapp={whatsapp} />;

  const goTo = (date: string, focusIt: boolean) => {
    moveFocus.current = focusIt;
    cal.setFocus(date);
    cal.setMonth(monthOf(date));
  };
  const pick = (date: string) => {
    cal.setShown(date);
    const day = statusOf(date, byDate, today);
    if (date >= cal.first && date <= cal.last) goTo(date, false);
    if (!day.available) return;
    cal.setSelected(date);
    cal.setAnnouncement(t("checkout.dates.selected", { date: formatWeekdayDayMonth(date, locale) }));
  };
  const onKey = (event: KeyboardEvent<HTMLElement>, date: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(date);
      return;
    }
    const next = nextFocus(date, event.key, cal.first, cal.last);
    if (next === null) return;
    event.preventDefault();
    goTo(next, true);
  };
  const changeMonth = (step: -1 | 1) => {
    const index = months.indexOf(cal.month) + step;
    const target = months[index];
    if (!target) return;
    // Keep the roving day inside the shown month, so Tab lands where the eye is.
    const candidate = `${target}-${cal.focus.slice(8)}`;
    const inMonth = monthWeeks(target).flat().includes(candidate) ? candidate : `${target}-01`;
    goTo(inMonth < cal.first ? cal.first : inMonth > cal.last ? cal.last : inMonth, false);
  };

  const selectedDay = cal.selected ? statusOf(cal.selected, byDate, today) : null;
  const shownDay = cal.shown ? statusOf(cal.shown, byDate, today) : null;
  const message = messageFor(shownDay, selectedDay, reason, t, locale);
  const monthLabel = formatMonthYear(`${cal.month}-01`, locale);
  const describedBy = cn("date-earliest date-instructions", error && "date-error");

  return (
    <div className="mt-4">
      <p id="date-earliest" className="font-semibold">
        {t("checkout.dates.earliest", { date: formatDayLabel(dates.earliest, locale) })}
      </p>
      {error && (
        <p id="date-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
      {/* Below 22rem the grid borrows the page gutters so seven 44 px days fit a 320 px phone. */}
      <div className="mt-3 max-w-md max-[22rem]:-mx-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="icon" aria-label={t("checkout.dates.previousMonth")} disabled={cal.month === months[0]} onClick={() => changeMonth(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p id="date-month" aria-live="polite" className="font-semibold">
            {monthLabel}
          </p>
          <Button type="button" variant="ghost" size="icon" aria-label={t("checkout.dates.nextMonth")} disabled={cal.month === months.at(-1)} onClick={() => changeMonth(1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <table ref={grid} role="grid" aria-labelledby="date-heading date-month" aria-describedby={describedBy} className="mt-2 block w-full border-collapse min-[20rem]:table min-[20rem]:table-fixed">
          <thead className="hidden min-[20rem]:table-header-group">
            <tr role="row">
              {WEEKDAYS.map((weekday) => (
                <th key={weekday} role="columnheader" scope="col" abbr={formatWeekday(weekday, locale)} className="pb-1 text-sm font-normal text-muted-foreground">
                  {formatWeekday(weekday, locale, "short")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1 min-[20rem]:table-row-group">
            {monthWeeks(cal.month).map((week) => (
              <tr key={week.find(Boolean)} role="row" className="contents min-[20rem]:table-row">
                {week.map((date, i) => {
                  if (!date) return <td key={`pad-${i}`} role="gridcell" aria-hidden="true" className="hidden min-[20rem]:table-cell" />;
                  const day = statusOf(date, byDate, today);
                  const focusable = date >= cal.first && date <= cal.last;
                  const selected = cal.selected === date;
                  return (
                    <DayCell key={date} day={day} label={dayLabel(day, selected, reason(day), t, locale)} focusable={focusable} tabbable={cal.focus === date} selected={selected} explained={cal.shown === date && !day.available} onPick={pick} onFocusDay={cal.setShown} onKey={onKey} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p id="date-instructions" className="sr-only">
          {t("checkout.dates.instructions")}
        </p>
        <p data-date-message className={cn("mt-3 min-h-12 border-l-4 pl-3", message.tone === "warning" ? "border-warning font-semibold" : message.tone === "info" ? "border-info" : message.tone === "ok" ? "border-success font-semibold" : "border-transparent text-muted-foreground")}>
          {message.text}
        </p>
        <p role="status" className="sr-only">
          {cal.announcement}
        </p>
      </div>
      <input type="hidden" name="date" value={cal.selected ?? ""} />
    </div>
  );
}
