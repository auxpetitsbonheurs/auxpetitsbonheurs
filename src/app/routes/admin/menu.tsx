import { CakeSlice, Ellipsis, EyeOff, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, isRouteErrorResponse, useFetcher, useRevalidator, useRouteError } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { showToast } from "~/components/ui/toaster";
import { PRODUCT_TYPES, type ProductStatusValue, type ProductType } from "~/domain/product";
import { todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { Translate } from "~/i18n/translator";
import { type Locale, formatRupees } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { MenuActionInput } from "~/server/contracts/admin";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { type AdminMenuRow, listAdminMenu } from "~/server/repos/admin-menu.server";
import { timed } from "~/server/server-timing.server";
import { deleteProduct } from "~/server/services/delete-product.server";
import { setProductStatus } from "~/server/services/product-status.server";
import { storageContext } from "~/server/storage.server";
import type { Route } from "./+types/menu";

/** `admin/menu` (FR-061): every product by type, with its row actions. */
export const handle = { titleKey: "admin.nav.menu" };

/** `admin/menu` loader (contracts.md): `{ title, byType }`, groups in PRODUCT_TYPES order. */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const { context } = args;
  const byType = await timed(context, "menu", () =>
    listAdminMenu(context.get(requestDbContext).db, {
      today: todayMU(context.get(clockContext).now()),
      supabaseUrl: context.get(publicConfigContext).supabaseUrl,
    }),
  );
  return { title: translate(handle.titleKey, me.locale), byType };
}

/**
 * `admin/menu` actions (contracts.md): `setStatus { id, status }` → `{ ok, id, status }`
 * (S-043); `delete { id }` → `{ ok, id }` (S-045). Unknown id NOT_FOUND; bad input
 * VALIDATION_FAILED; offering a product with no photo VALIDATION_FAILED `fields.status`.
 */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const input = MenuActionInput.safeParse(Object.fromEntries(await args.request.formData()));
  if (!input.success) return actionError("VALIDATION_FAILED", me.locale);
  const db = args.context.get(requestDbContext).db;
  if (input.data.intent === "delete") {
    const deleted = await deleteProduct(db, args.context.get(storageContext), input.data.id);
    if (!deleted.ok) return actionError(deleted.code, me.locale);
    console.log(JSON.stringify({ level: "info", event: "product_deleted", id: deleted.id, photosQueued: deleted.photosQueued, actorRole: me.role }));
    return { ok: true as const, id: deleted.id };
  }
  const context = { adminId: me.id, now: args.context.get(clockContext).now() };
  const result = await setProductStatus(db, input.data, context);
  if (!result.ok) {
    const fields = result.code === "VALIDATION_FAILED" ? { status: translate("admin.product.errors.status_photo", me.locale) } : undefined;
    return actionError(result.code, me.locale, fields ? { fields } : {});
  }
  console.log(JSON.stringify({ level: "info", event: "product_status_changed", id: result.id, status: result.status, actorRole: me.role }));
  return result;
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

/** A row's text in the admin's language: name with English fallback, "Rs 850", tags as words. */
export function rowView(row: AdminMenuRow, locale: Locale, t: Translate) {
  const tags: string[] = [];
  if (row.status !== "available") tags.push(t(`admin.menu.tag.${row.status}`));
  if (row.seasonal) tags.push(t(`admin.menu.tag.seasonal_${row.seasonal}`));
  return { name: localized(row.name, locale), price: formatRupees(row.fromPriceRs, locale), tags };
}

/** Load failure (S-041 AC3): the page keeps its heading and offers Retry; 403/404 as any admin page. */
export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
  const error = useRouteError();
  const { t } = useI18n();
  const revalidator = useRevalidator();
  if (isRouteErrorResponse(error) && (error.status === 403 || error.status === 404)) return <AdminErrorBoundary error={props.error} />;
  return (
    <>
      <h1>{t("admin.nav.menu")}</h1>
      <Alert tone="danger" role="alert" title={t("admin.menu.loadFailedTitle")} className="mt-6">
        <p>{t("admin.menu.loadFailedBody")}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void revalidator.revalidate()} aria-busy={revalidator.state === "loading" || undefined}>
          {t("admin.states.retry")}
        </Button>
      </Alert>
    </>
  );
}

function RowPhoto({ url }: { url: string | null }) {
  // Decorative: the name is the row's text (S-041 AC5).
  if (!url) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-decorative">
        <CakeSlice aria-hidden="true" className="size-6 text-muted-foreground" />
      </span>
    );
  }
  return <img src={url} alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-md bg-decorative object-cover" />;
}

/** One fetcher per product, shared by its row (optimistic state) and its sheet (the buttons). */
const statusKey = (id: string) => `status-${id}`;
type StatusResult = { ok: true; id: string; status: ProductStatusValue } | { ok: false; error: { message: string; fields?: Record<string, string> } };

/**
 * The row's status while a change is on its way (optimistic, S-043), and the toast or the
 * inline error once the server answers. A refusal puts the row back and says why, in the
 * row and in a toast that stays until dismissed.
 */
function useRowStatus(row: AdminMenuRow) {
  const { t, locale } = useI18n();
  const fetcher = useFetcher<StatusResult>({ key: statusKey(row.id) });
  const pending = fetcher.state !== "idle" ? (fetcher.formData?.get("status") as ProductStatusValue | null) : null;
  const handled = useRef<unknown>(null);
  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) return;
    handled.current = result;
    const name = localized(row.name, locale);
    if (result.ok) showToast(t(`admin.menu.statusDone.${result.status}`, { name }));
    else showToast(t("admin.menu.statusFailed", { name, reason: result.error.fields?.status ?? result.error.message }), "error");
  });
  const refusal = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok ? (fetcher.data.error.fields?.status ?? fetcher.data.error.message) : null;
  return { status: pending ?? row.status, saving: pending !== null, refusal };
}

function ProductRow({ row, onActions }: { row: AdminMenuRow; onActions: (row: AdminMenuRow) => void }) {
  const { t, locale } = useI18n();
  const { status, saving, refusal } = useRowStatus(row);
  const view = rowView({ ...row, status }, locale, t);
  return (
    // Wraps at 200% zoom on a 320 px phone: the name takes its own line rather than a sliver.
    <li className="flex min-h-20 flex-wrap items-center gap-3 p-3" data-status={status} aria-busy={saving || undefined}>
      <RowPhoto url={row.imageUrl} />
      <div className="min-w-0 flex-[1_1_8rem]">
        <Link to={`/admin/menu/${row.id}`} prefetch="intent" className="inline-flex min-h-11 items-center font-semibold wrap-anywhere hover:underline">
          {view.name}
        </Link>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="whitespace-nowrap tabular-nums">{t("admin.menu.fromPrice", { price: view.price })}</span>
          {view.tags.map((tag) => (
            <span key={tag} className="rounded-sm border border-input px-1.5 font-semibold">
              {tag}
            </span>
          ))}
          {saving && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              {t("admin.menu.saving")}
            </span>
          )}
        </p>
        {refusal && <p className="mt-1 text-sm font-semibold text-destructive">{refusal}</p>}
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label={t("admin.menu.actionsFor", { name: view.name })} onClick={() => onActions(row)}>
        <Ellipsis aria-hidden="true" />
      </Button>
    </li>
  );
}

function AddProductLink({ type, label }: { type: ProductType; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="mt-3">
      <Link to={`/admin/menu/new?type=${type}`}>
        <Plus aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

function TypeGroup({ type, rows, onActions }: { type: ProductType; rows: AdminMenuRow[]; onActions: (row: AdminMenuRow) => void }) {
  const { t } = useI18n();
  const headingId = `group-${type}`;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="text-h2">
        {t(`admin.menu.group.${type}`)}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-card border border-border bg-card p-4">
          <p>{t(`admin.menu.empty.${type}`)}</p>
          <AddProductLink type={type} label={t("admin.menu.addProduct")} />
        </div>
      ) : (
        <ul aria-labelledby={headingId} className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
          {rows.map((row) => (
            <ProductRow key={row.id} row={row} onActions={onActions} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The status buttons a row offers: one tap each (S-043). */
function statusChoices(status: ProductStatusValue): { status: ProductStatusValue; label: string }[] {
  if (status === "hidden") return [{ status: "available", label: "admin.menu.show" }];
  if (status === "sold_out") return [{ status: "available", label: "admin.menu.markAvailable" }, { status: "hidden", label: "admin.menu.hide" }];
  return [{ status: "sold_out", label: "admin.menu.markSoldOut" }, { status: "hidden", label: "admin.menu.hide" }];
}

function StatusButtons({ row, onDone }: { row: AdminMenuRow; onDone: () => void }) {
  const { t } = useI18n();
  const fetcher = useFetcher<StatusResult>({ key: statusKey(row.id) });
  const current = fetcher.state !== "idle" ? ((fetcher.formData?.get("status") as ProductStatusValue | null) ?? row.status) : row.status;
  return statusChoices(current).map((choice) => (
    <li key={choice.status}>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          // The sheet closes at once; the row shows the new state while the server confirms.
          void fetcher.submit({ intent: "setStatus", id: row.id, status: choice.status }, { method: "post", action: "/admin/menu" });
          onDone();
        }}
      >
        {t(choice.label)}
      </Button>
    </li>
  ));
}

function RowActions({ row, onClose, onDelete }: { row: AdminMenuRow | null; onClose: () => void; onDelete: (row: AdminMenuRow) => void }) {
  const { t, locale } = useI18n();
  const name = row ? localized(row.name, locale) : "";
  return (
    <Modal open={row !== null} onClose={onClose} title={name} closeLabel={t("admin.states.close")}>
      {row && (
        <ul className="grid gap-2">
          <li>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/admin/menu/${row.id}`}>{t("admin.menu.edit")}</Link>
            </Button>
          </li>
          <StatusButtons row={row} onDone={onClose} />
          <li className="mt-4">
            {/* Destructive in the sheet: outline in danger with an icon (filled only in the confirm dialog). */}
            <Button type="button" variant="outline" className="w-full border-destructive text-destructive" onClick={() => onDelete(row)}>
              <Trash2 aria-hidden="true" />
              {t("admin.menu.delete")}
            </Button>
          </li>
        </ul>
      )}
    </Modal>
  );
}

/**
 * Delete confirmation (S-045 AC2): names the product, recommends Hide instead, and deletes
 * only on its own explicit button (the second press after the sheet's Delete).
 */
function DeleteDialog({ row, onClose, onConfirm }: { row: AdminMenuRow | null; onClose: () => void; onConfirm: (row: AdminMenuRow) => void }) {
  const { t, locale } = useI18n();
  // After a confirmed delete the trigger's row is leaving: focus goes to the page instead.
  const confirmed = useRef(false);
  const hider = useFetcher<StatusResult>({ key: statusKey(row?.id ?? "none") });
  const name = row ? localized(row.name, locale) : "";
  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title={t("admin.menu.deleteTitle", { name })}
      closeLabel={t("admin.states.close")}
      variant="dialog"
      returnFocusTo={() => {
        const deleted = confirmed.current;
        confirmed.current = false;
        return deleted ? "main" : null;
      }}
    >
      {row && (
        <>
          <p>{t("admin.menu.deleteBody")}</p>
          <p className="mt-2 font-semibold">{t("admin.menu.deleteRecommend")}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {row.status !== "hidden" && (
              <Button
                type="button"
                onClick={() => {
                  void hider.submit({ intent: "setStatus", id: row.id, status: "hidden" }, { method: "post", action: "/admin/menu" });
                  onClose();
                }}
              >
                <EyeOff aria-hidden="true" />
                {t("admin.menu.hideInstead")}
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                confirmed.current = true;
                onConfirm(row);
              }}
            >
              <Trash2 aria-hidden="true" />
              {t("admin.menu.deleteConfirm")}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

type DeleteResult = { ok: true; id: string } | { ok: false; error: { message: string } };

/**
 * One delete at a time. The row leaves at once (optimistic) and a toast confirms; a refusal
 * brings the row back and says so in a toast that stays.
 */
function useDelete() {
  const { t, locale } = useI18n();
  const fetcher = useFetcher<DeleteResult>({ key: "menu-delete" });
  const names = useRef(new Map<string, string>());
  const handled = useRef<unknown>(null);
  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) return;
    handled.current = result;
    if (result.ok) showToast(t("admin.menu.deleted", { name: names.current.get(result.id) ?? "" }));
    else showToast(t("admin.menu.deleteFailed", { reason: result.error.message }), "error");
  });
  const pending = fetcher.state !== "idle" ? String(fetcher.formData?.get("id") ?? "") : null;
  const done = fetcher.state === "idle" && fetcher.data?.ok ? fetcher.data.id : null;
  return {
    goneId: pending ?? done,
    remove: (row: AdminMenuRow) => {
      // Kept for the toast: once deleted, the row is no longer in the loader data.
      names.current.set(row.id, localized(row.name, locale));
      void fetcher.submit({ intent: "delete", id: row.id }, { method: "post", action: "/admin/menu" });
    },
  };
}

export default function AdminMenu({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<AdminMenuRow | null>(null);
  const [toDelete, setToDelete] = useState<AdminMenuRow | null>(null);
  const { goneId, remove } = useDelete();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{loaderData.title}</h1>
        <Button asChild size="sm">
          <Link to="/admin/menu/new">
            <Plus aria-hidden="true" />
            {t("admin.menu.addProduct")}
          </Link>
        </Button>
      </div>
      {PRODUCT_TYPES.map((type) => (
        <TypeGroup key={type} type={type} rows={loaderData.byType[type].filter((row) => row.id !== goneId)} onActions={setSelected} />
      ))}
      <RowActions
        row={selected}
        onClose={() => setSelected(null)}
        onDelete={(row) => {
          setSelected(null);
          setToDelete(row);
        }}
      />
      <DeleteDialog
        row={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={(row) => {
          setToDelete(null);
          remove(row);
        }}
      />
    </>
  );
}
