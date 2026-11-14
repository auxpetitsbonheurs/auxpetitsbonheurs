import { ChevronLeft, Printer, Share2 } from "lucide-react";
import { Link, data } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { AllergyBadge } from "~/components/admin/order/workshop-section";
import { Button } from "~/components/ui/button";
import { showToast } from "~/components/ui/toaster";
import { formatDayLabel } from "~/domain/time";
import { holdsPlace, timeRange } from "~/domain/workshop";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { requireAdmin } from "~/server/auth.server";
import { Uuid } from "~/server/contracts/shared";
import { requestDbContext } from "~/server/db.server";
import { findAdminEvent, listEventRegistrations } from "~/server/repos/workshops.server";
import type { Route } from "./+types/workshop-list";

/**
 * `admin/workshop-list` (E-15 S-305 AC2): the event's active registrations to print (names,
 * phone, cakes and choices, people, allergies highlighted) like the prep list. Share sends a
 * summary without any customer data or allergies (counts per cake and the number of allergy
 * notes), so health data never leaves the admin app by Share.
 */
export const handle = { titleKey: "admin.nav.workshops" };

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = Uuid.safeParse(args.params.id);
  if (!id.success) throw data(null, { status: 404 });
  const db = args.context.get(requestDbContext).db;
  const event = await findAdminEvent(db, id.data);
  if (!event) throw data(null, { status: 404 });
  const rows = (await listEventRegistrations(db, event.id)).filter((r) => holdsPlace(r.status));
  const dateLabel = formatDayLabel(event.eventOn, me.locale);
  const timeLabel = timeRange(event.startsAt, event.endsAt, me.locale);
  const totals = new Map<string, number>();
  for (const r of rows) for (const c of r.choices) totals.set(localized(c.name, me.locale), (totals.get(localized(c.name, me.locale)) ?? 0) + c.quantity);
  const allergyNotes = rows.filter((r) => r.allergies).length;
  const cakes = rows.reduce((n, r) => n + r.cakes, 0);
  const shareText = [
    `${event.titleEn}: ${dateLabel}, ${timeLabel}`,
    translate("admin.workshops.share.cakes", me.locale, { count: cakes, capacity: event.capacity }),
    ...[...totals].map(([name, count]) => translate("admin.workshops.optionTotal", me.locale, { name, count })),
    translate("admin.workshops.share.allergies", me.locale, { count: allergyNotes }),
  ].join("\n");
  return {
    title: translate("admin.workshops.listTitle", me.locale, { title: event.titleEn }),
    eventId: event.id,
    eventTitle: event.titleEn,
    dateLabel,
    timeLabel,
    address: event.address,
    cakes,
    capacity: event.capacity,
    totals: [...totals].map(([name, count]) => ({ name, count })),
    rows: rows.map((r) => ({ number: r.number, name: r.contactName, phone: r.contactPhone, cakes: r.cakes, choices: r.choices.map((c) => `${localized(c.name, me.locale)} × ${c.quantity}`).join(", "), people: r.peopleNames, allergies: r.allergies, paid: r.paid, status: r.status })),
    shareText,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

async function share(text: string, title: string, copied: string, failed: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(copied);
  } catch {
    showToast(failed, "error");
  }
}

export default function WorkshopList({ loaderData: d }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <>
      <Link to={`/admin/workshops/${d.eventId}`} className="inline-flex min-h-11 items-center gap-1 font-semibold link print:hidden">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("admin.workshops.backToEvent")}
      </Link>
      <h1 className="mt-2 wrap-anywhere">{d.eventTitle}</h1>
      <p className="mt-1">
        {d.dateLabel}, {d.timeLabel} · {d.address}
      </p>
      <p className="mt-1 font-semibold">{t("admin.workshops.share.cakes", { count: d.cakes, capacity: d.capacity })}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {d.totals.map((o) => (
          <li key={o.name} className="rounded-full border border-border px-3 py-1 font-semibold">
            {t("admin.workshops.optionTotal", { name: o.name, count: o.count })}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3 print:hidden">
        <Button type="button" size="lg" onClick={() => void share(d.shareText, d.eventTitle, t("admin.prep.copied"), t("admin.prep.copyFailed"))}>
          <Share2 aria-hidden="true" />
          {t("admin.prep.share")}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          {t("admin.prep.print")}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground print:hidden">{t("admin.workshops.shareNote")}</p>
      {d.rows.length === 0 ? (
        <p className="mt-6">{t("admin.workshops.noRegistrations")}</p>
      ) : (
        <ol className="mt-6 grid gap-3">
          {d.rows.map((r) => (
            <li key={r.number} className="grid gap-1 rounded-card border border-border bg-card p-3" style={{ breakInside: "avoid" }}>
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-semibold">{r.number}</span>
                <span className="font-semibold wrap-anywhere">{r.name}</span>
                <span className="tabular-nums">{r.phone}</span>
                <span className="text-sm">{t(`admin.status.${r.status}`)}</span>
              </p>
              <p>
                {t("admin.workshops.cakesCount", { count: r.cakes })}: {r.choices}
              </p>
              {r.people && <p className="wrap-anywhere">{t("admin.workshops.peopleLine", { names: r.people })}</p>}
              <div>
                <AllergyBadge allergies={r.allergies} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
