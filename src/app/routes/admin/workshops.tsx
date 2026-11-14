import { ChevronRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { Button } from "~/components/ui/button";
import { formatDayLabel, todayMU } from "~/domain/time";
import { timeRange } from "~/domain/workshop";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { listAdminEvents } from "~/server/repos/workshops.server";
import type { Route } from "./+types/workshops";

/** `admin/workshops` (E-15 S-301 AC1): Owner and Admin. Upcoming first (soonest first), then past. */
export const handle = { titleKey: "admin.nav.workshops" };

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const today = todayMU(args.context.get(clockContext).now());
  const events = await listAdminEvents(args.context.get(requestDbContext).db, today);
  return {
    title: translate("admin.nav.workshops", me.locale),
    events: events.map((e) => ({ ...e, past: e.eventOn < today, dateLabel: formatDayLabel(e.eventOn, me.locale), timeLabel: timeRange(e.startsAt, e.endsAt, me.locale) })),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type Row = Route.ComponentProps["loaderData"]["events"][number];

function EventRow({ event }: { event: Row }) {
  const { t } = useI18n();
  return (
    <li>
      <Link to={`/admin/workshops/${event.id}`} prefetch="intent" className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted">
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="font-semibold wrap-anywhere">{event.title}</span>
          <span className="text-sm">
            {event.dateLabel}, {event.timeLabel}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex min-h-6 items-center rounded-full border border-border px-2 font-semibold">{t(`admin.workshops.status.${event.status}`)}</span>
            <span>{t("admin.workshops.held", { held: event.held, capacity: event.capacity })}</span>
            {event.pending > 0 && <span className="font-semibold">{t("admin.workshops.pending", { count: event.pending })}</span>}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

export default function AdminWorkshops({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const upcoming = loaderData.events.filter((e) => !e.past);
  const past = loaderData.events.filter((e) => e.past);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{loaderData.title}</h1>
        <Button asChild size="lg">
          <Link to="/admin/workshops/new">
            <Plus aria-hidden="true" />
            {t("admin.workshops.new")}
          </Link>
        </Button>
      </div>
      {loaderData.events.length === 0 && <p className="mt-6">{t("admin.workshops.empty")}</p>}
      {upcoming.length > 0 && (
        <section aria-labelledby="ws-upcoming" className="mt-6">
          <h2 id="ws-upcoming" className="text-lg">
            {t("admin.workshops.upcoming")}
          </h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {upcoming.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="ws-past" className="mt-8">
          <h2 id="ws-past" className="text-lg">
            {t("admin.workshops.past")}
          </h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {past.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
