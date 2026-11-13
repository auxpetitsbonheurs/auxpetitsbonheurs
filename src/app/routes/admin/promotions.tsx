import { Plus, Tag } from "lucide-react";
import { type FormEvent, useEffect, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { showToast } from "~/components/ui/toaster";
import { type PromoStatus, promotionStatus } from "~/domain/promotions";
import { formatClockTime, formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { PromotionActiveInput, PromotionIdInput } from "~/server/contracts/promotions";
import { requestDbContext } from "~/server/db.server";
import { deletePromotion, listAdminPromotions, setPromotionActive } from "~/server/services/save-promotion.server";
import type { Route } from "./+types/promotions";

/** `admin/promotions` (S-052, FR-063): every promotion with its status; switch on/off, delete. */
export const handle = { titleKey: "admin.nav.promotions" };

/** "Fri 13 Nov 18:00" in Mauritius time, with the year when it is not `thisYear`. */
export function promoInstantLabel(instant: Date, locale: Locale, thisYear: string): string {
  const date = todayMU(instant);
  const year = date.slice(0, 4) === thisYear ? "" : ` ${date.slice(0, 4)}`;
  return `${formatDayLabel(date, locale)}${year} ${formatClockTime(instant)}`;
}

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const now = args.context.get(clockContext).now();
  const rows = await listAdminPromotions(args.context.get(requestDbContext).db);
  const thisYear = todayMU(now).slice(0, 4);
  return {
    title: translate(handle.titleKey, me.locale),
    promotions: rows.map((row) => ({
      id: row.id,
      title: row.title,
      active: row.active,
      status: promotionStatus(row, now),
      window: translate("admin.promotions.window", me.locale, { start: promoInstantLabel(row.startsAt, me.locale, thisYear), end: promoInstantLabel(row.endsAt, me.locale, thisYear) }),
      placement: row.placement,
      productCount: row.productCount,
    })),
  };
}

/** `setActive` { id, active } · `delete` { id }; each answer carries its intent. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = await args.request.formData();
  const intent = form.get("intent");
  const db = args.context.get(requestDbContext).db;
  if (intent === "setActive") {
    const parsed = PromotionActiveInput.safeParse({ id: form.get("id"), active: form.get("active") });
    if (!parsed.success) return actionError("VALIDATION_FAILED", me.locale, { extra: { intent } });
    const found = await setPromotionActive(db, parsed.data.id, parsed.data.active, args.context.get(clockContext).now());
    if (!found) return actionError("NOT_FOUND", me.locale, { extra: { intent } });
    return { ok: true as const, intent, active: parsed.data.active };
  }
  if (intent === "delete") {
    const parsed = PromotionIdInput.safeParse({ id: form.get("id") });
    if (!parsed.success) return actionError("VALIDATION_FAILED", me.locale, { extra: { intent } });
    const outcome = await deletePromotion(db, parsed.data.id, args.context.get(clockContext).now());
    if (outcome === "not_found") return actionError("NOT_FOUND", me.locale, { extra: { intent } });
    if (outcome === "live") return actionError("VALIDATION_FAILED", me.locale, { fields: { id: translate("admin.promotions.endFirst", me.locale) }, extra: { intent } });
    console.log(JSON.stringify({ level: "info", event: "promotion_deleted", id: parsed.data.id, actorRole: me.role }));
    return { ok: true as const, intent };
  }
  return actionError("VALIDATION_FAILED", me.locale);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type Row = Route.ComponentProps["loaderData"]["promotions"][number];
type Answer = { ok: true; intent: string; active?: boolean } | { ok: false; error: { message: string; fields?: Record<string, string> } };

const STATUS_TONE: Record<PromoStatus, string> = {
  live: "bg-primary text-primary-foreground",
  scheduled: "bg-accent text-accent-foreground",
  ended: "bg-muted text-foreground",
  inactive: "bg-muted text-foreground",
};

/** Toasts a confirmation once per answer; an error stays on the row. */
function useRowAnswer(fetcher: { state: string; data?: unknown }) {
  const { t } = useI18n();
  const handled = useRef<unknown>(null);
  const answer = fetcher.state === "idle" ? (fetcher.data as Answer | undefined) : undefined;
  useEffect(() => {
    if (!answer || handled.current === answer || !answer.ok) return;
    handled.current = answer;
    if (answer.intent === "setActive") showToast(t(answer.active ? "admin.promotions.switchedOn" : "admin.promotions.switchedOff"));
  });
  return answer && !answer.ok ? (answer.error.fields?.id ?? answer.error.message) : undefined;
}

function PromotionRow({ row }: { row: Row }) {
  const { t } = useI18n();
  const fetcher = useFetcher();
  const error = useRowAnswer(fetcher);
  const pendingIntent = fetcher.formData?.get("intent");
  // Shown at once: the switch and the removal do not wait for the server.
  const active = pendingIntent === "setActive" ? fetcher.formData?.get("active") === "true" : row.active;
  const deleted = (fetcher.data as Answer | undefined)?.ok === true && (fetcher.data as { intent?: string }).intent === "delete";
  if (pendingIntent === "delete" || deleted) return null;
  // Turned on but not reloaded yet: its date status is not known here, so no badge for a moment.
  const shownStatus: PromoStatus | null = !active ? "inactive" : row.status === "inactive" ? null : row.status;
  const products = row.productCount === 0 ? t("admin.promotions.noProducts") : row.productCount === 1 ? t("admin.promotions.productCountOne") : t("admin.promotions.productCount", { count: row.productCount });
  const confirmDelete = (event: FormEvent) => {
    if (!window.confirm(t("admin.promotions.deleteConfirm", { title: row.title }))) event.preventDefault();
    // The row goes at once and leaves the page when the list reloads, so confirm now; a refusal brings it back with its error.
    else showToast(t("admin.promotions.deleted"));
  };
  return (
    <li className="rounded-lg border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 text-lg font-semibold wrap-anywhere">
          <Link to={`/admin/promotions/${row.id}`} className="inline-flex min-h-11 items-center link" aria-label={t("admin.promotions.editNamed", { title: row.title })}>
            {row.title}
          </Link>
        </h2>
        {shownStatus && <span className={`rounded-sm px-2 py-0.5 text-sm font-semibold ${STATUS_TONE[shownStatus]}`}>{t(`admin.promotions.status.${shownStatus}`)}</span>}
      </div>
      <p className="mt-1 text-sm">{row.window}</p>
      <p className="text-sm text-muted-foreground">
        {t(`admin.promotions.placement.${row.placement}`)} · {products}
      </p>
      {error && (
        <Alert tone="danger" role="alert" className="mt-2">
          <p>{error}</p>
        </Alert>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="setActive" />
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="active" value={active ? "false" : "true"} />
          <Button type="submit" variant="outline" size="sm" aria-label={`${t(active ? "admin.promotions.turnOff" : "admin.promotions.turnOn")}: ${row.title}`}>
            {t(active ? "admin.promotions.turnOff" : "admin.promotions.turnOn")}
          </Button>
        </fetcher.Form>
        {/* A Live promotion is ended first (S-052 AC4): Turn off, then Delete. */}
        {shownStatus !== "live" && (
        <fetcher.Form method="post" onSubmit={confirmDelete}>
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={row.id} />
          <Button type="submit" variant="ghost" size="sm" aria-label={`${t("admin.promotions.delete")}: ${row.title}`}>
            {t("admin.promotions.delete")}
          </Button>
        </fetcher.Form>
        )}
      </div>
    </li>
  );
}

export default function AdminPromotions({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <>
      <h1>{loaderData.title}</h1>
      <p className="mt-2">{t("admin.promotions.intro")}</p>
      <Button asChild className="mt-4">
        <Link to="/admin/promotions/new">
          <Plus aria-hidden="true" />
          {t("admin.promotions.new")}
        </Link>
      </Button>
      {loaderData.promotions.length === 0 ? (
        <p className="mt-6 flex items-center gap-2">
          <Tag aria-hidden="true" className="size-5" />
          {t("admin.promotions.empty")}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {loaderData.promotions.map((row) => (
            <PromotionRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}
