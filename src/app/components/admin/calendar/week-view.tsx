import { Lock } from "lucide-react";
import { OrderRow } from "~/components/admin/orders/order-row";
import { listLinkClass } from "~/components/admin/orders/types";
import { useI18n } from "~/i18n/react";
import type { CalendarLoaderData } from "~/routes/admin/calendar";
import { calendarHref } from "./header";

type Day = CalendarLoaderData["days"][number];

/** "Blocked" / "Closed day" as icon plus word (S-136 AC3, AC4; never colour alone). */
export function DayState({ day }: { day: Day }) {
  const { t } = useI18n();
  if (!day.blocked && !day.closedDay) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-sm font-semibold">
      {day.blocked && <Lock aria-hidden="true" className="size-4" />}
      {day.blocked ? t("admin.calendar.blockedWord") : t("admin.calendar.closedDay")}
    </span>
  );
}

/** Week view (S-137 AC1-AC3): each day's active orders by window start then number, else "Nothing planned." */
export function WeekView({ data }: { data: CalendarLoaderData }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 grid gap-6">
      {data.days.map((day) => {
        const orders = data.list.filter((order) => order.fulfilOn === day.date);
        const id = `week-day-${day.date}`;
        return (
          <section key={day.date} aria-labelledby={id}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={id} className="text-lg font-semibold first-letter:uppercase">
                <a href={calendarHref("day", day.date)} className="link inline-flex min-h-11 items-center">
                  {day.longLabel}
                </a>
              </h3>
              {day.date === data.today && <span className="text-sm font-semibold">{t("admin.calendar.todayWord")}</span>}
              <DayState day={day} />
            </div>
            {orders.length === 0 ? (
              <p className="mt-2">{t("admin.calendar.nothingPlanned")}</p>
            ) : (
              <ul className="mt-2 grid gap-3" aria-labelledby={id}>
                {orders.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {data.more && (
        <p>
          {t("admin.calendar.weekTooBusy")}{" "}
          <a href={calendarHref("day", data.date)} className={listLinkClass}>
            {t("admin.calendar.openDayView")}
          </a>
        </p>
      )}
    </div>
  );
}
