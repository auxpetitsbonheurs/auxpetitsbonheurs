import { ArrowDown, ArrowUp, CakeSlice, Ellipsis, EyeOff, GripVertical, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
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
import { MenuActionInput, parseReorderForm } from "~/server/contracts/admin";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { type AdminMenuRow, listAdminMenu } from "~/server/repos/admin-menu.server";
import { timed } from "~/server/server-timing.server";
import { deleteProduct } from "~/server/services/delete-product.server";
import { reorderProducts } from "~/server/services/reorder-products.server";
import { setProductStatus } from "~/server/services/product-status.server";
import { afterResponseContext } from "~/server/after-response.server";
import { storageContext } from "~/server/storage.server";
import { moveItem, useDragSort } from "~/lib/use-drag-sort";
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
 * `admin/menu` actions (contracts.md): `reorder { type, ids }` → `{ ok, type, ids }` (S-042);
 * `setStatus { id, status }` → `{ ok, id, status }`
 * (S-043); `delete { id }` → `{ ok, id }` (S-045). Unknown id NOT_FOUND; bad input
 * VALIDATION_FAILED; offering a product with no photo VALIDATION_FAILED `fields.status`.
 */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = await args.request.formData();
  const db = args.context.get(requestDbContext).db;
  if (form.get("intent") === "reorder") return reorder(db, form, me);
  const input = MenuActionInput.safeParse(Object.fromEntries(form));
  if (!input.success) return actionError("VALIDATION_FAILED", me.locale);
  if (input.data.intent === "delete") {
    // Storage clean-up runs after the response (ADR-0003 amendment 3).
    const deleted = await deleteProduct(db, args.context.get(storageContext), input.data.id, args.context.get(afterResponseContext));
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

/** `reorder { type, ids }` → `{ ok, type, ids }`; ids not exactly that type's products → VALIDATION_FAILED "The menu changed, reload". */
async function reorder(db: Parameters<typeof reorderProducts>[0], form: FormData, me: { locale: Locale; role: string }) {
  const input = parseReorderForm(form);
  const changed = () => actionError("VALIDATION_FAILED", me.locale, { fields: { ids: translate("admin.menu.reorderChanged", me.locale) } });
  if (!input.success) return changed();
  const result = await reorderProducts(db, input.data.type, input.data.ids);
  if (!result.ok) return changed();
  console.log(JSON.stringify({ level: "info", event: "products_reordered", type: result.type, count: result.ids.length, actorRole: me.role }));
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

interface RowHandle {
  type: ProductType;
  dragging: boolean;
  pointer: ReturnType<ReturnType<typeof useDragSort>["handleProps"]>;
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function ProductRow({ row, onActions, handle }: { row: AdminMenuRow; onActions: (row: AdminMenuRow) => void; handle: RowHandle }) {
  const { t, locale } = useI18n();
  const { status, saving, refusal } = useRowStatus(row);
  const view = rowView({ ...row, status }, locale, t);
  return (
    // Wraps at 200% zoom on a 320 px phone: the name takes its own line rather than a sliver.
    <li data-sort-item="" data-dragging={handle.dragging || undefined} className="flex min-h-20 flex-wrap items-center gap-3 p-3 data-dragging:bg-accent" data-status={status} aria-busy={saving || undefined}>
      {/* Drag by pointer, or focus and use the arrow keys (S-042 AC3); Move up/down are in the row's sheet. */}
      <button
        type="button"
        data-reorder-handle={row.id}
        aria-label={t("admin.menu.reorder", { name: view.name })}
        aria-describedby={`reorder-help-${handle.type}`}
        onKeyDown={handle.onKey}
        {...handle.pointer}
        className="-ms-1 flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical aria-hidden="true" className="size-5" />
      </button>
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

/** Polite live region for reorder results ("Chocolate cake moved to position 2 of 5"). */
function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => {
    // Cleared first so the same sentence twice is announced twice.
    setMessage("");
    requestAnimationFrame(() => setMessage(text));
  }, []);
  const region = (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
  return { announce, region };
}

type ReorderAnswer = { ok: true; type: ProductType; ids: string[] } | { ok: false; error: { message: string; fields?: Record<string, string> } };

/** What the sheet's Move up / Move down buttons need for the open row. */
interface Mover {
  index: number;
  count: number;
  move: (delta: -1 | 1) => void;
}

const sameMembers = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * One type's order (S-042): the loader's, or while a move is on its way the posted one
 * (optimistic), or during a pointer drag the live draft. Every finished move autosaves.
 */
function useTypeOrder(type: ProductType, rows: AdminMenuRow[]) {
  const fetcher = useFetcher<ReorderAnswer>({ key: `reorder-${type}` });
  const [draft, setDraft] = useState<string[] | null>(null);
  const loaded = rows.map((r) => r.id);
  const posted = fetcher.state !== "idle" ? (fetcher.formData?.getAll("ids").map(String) ?? null) : null;
  const answered = fetcher.state === "idle" && fetcher.data?.ok ? fetcher.data.ids : null;
  // The answer bridges the gap until the loader has the new order; a different set means the menu changed since.
  const pick = (ids: string[] | null) => (ids && sameMembers(ids, loaded) ? ids : null);
  const ids = draft ?? pick(posted) ?? pick(answered) ?? loaded;
  const save = (next: string[]) => {
    const body = new FormData();
    body.set("intent", "reorder");
    body.set("type", type);
    for (const id of next) body.append("ids", id);
    void fetcher.submit(body, { method: "post", action: "/admin/menu" });
  };
  // Reload clears the refusal: the fresh list is what the next move starts from.
  const [dismissed, setDismissed] = useState<unknown>(null);
  const refusal = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok && fetcher.data !== dismissed ? fetcher.data : null;
  const failed = refusal ? (refusal.error.fields?.ids ?? refusal.error.message) : null;
  const state: "saving" | "saved" | "failed" | null = fetcher.state !== "idle" ? "saving" : failed ? "failed" : answered ? "saved" : null;
  return { ids, draft, setDraft, save, state, failed, dismiss: () => setDismissed(fetcher.data) };
}

function TypeGroup(props: {
  type: ProductType;
  rows: AdminMenuRow[];
  selected: AdminMenuRow | null;
  onActions: (row: AdminMenuRow) => void;
  onClose: () => void;
  onDelete: (row: AdminMenuRow) => void;
  announce: (text: string) => void;
}) {
  const { type, rows, announce } = props;
  const { t, locale } = useI18n();
  const revalidator = useRevalidator();
  const headingId = `group-${type}`;
  const order = useTypeOrder(type, rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = order.ids.map((id) => byId.get(id)).filter((r): r is AdminMenuRow => r !== undefined);
  const list = useRef<HTMLUListElement>(null);
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (!refocus.current) return;
    list.current?.querySelector<HTMLElement>(`[data-reorder-handle="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });
  const nameOf = (id: string) => localized(byId.get(id)?.name ?? { en: "", fr: null }, locale);
  const moved = (id: string, to: number, count: number) => announce(t("admin.menu.moved", { name: nameOf(id), n: to + 1, count }));
  const moveBy = (id: string, delta: -1 | 1, keepFocus = false) => {
    const from = order.ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.ids.length) return;
    if (keepFocus) refocus.current = id;
    order.save(moveItem(order.ids, from, to));
    moved(id, to, order.ids.length);
  };
  const drag = useDragSort({
    container: list,
    onMove: (from, to) => order.setDraft((current) => moveItem(current ?? order.ids, from, to)),
    onDrop: (_from, to) => {
      // The draft already holds the moves made while dragging.
      const next = [...order.ids];
      order.setDraft(null);
      order.save(next);
      moved(next[to]!, to, next.length);
    },
  });
  const onKey = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moveBy(id, event.key === "ArrowUp" ? -1 : 1, true);
  };
  const open = props.selected && byId.has(props.selected.id) ? props.selected : null;
  const mover: Mover | null = open ? { index: order.ids.indexOf(open.id), count: order.ids.length, move: (delta) => moveBy(open.id, delta) } : null;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id={headingId} className="text-h2">
          {t(`admin.menu.group.${type}`)}
        </h2>
        <p role="status" className="inline-flex items-center gap-1 text-sm font-semibold">
          {order.state === "saving" && <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />}
          {order.state === "saving" ? t("admin.menu.saving") : order.state === "saved" ? t("admin.menu.orderSaved") : ""}
        </p>
      </div>
      <p id={`reorder-help-${type}`} className="sr-only">
        {t("admin.menu.reorderHelp")}
      </p>
      {order.failed && (
        <Alert tone="danger" role="alert" title={order.failed} className="mt-3">
          <p>{t("admin.menu.reorderFailedBody")}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              order.dismiss();
              void revalidator.revalidate();
            }}
          >
            {t("admin.menu.reload")}
          </Button>
        </Alert>
      )}
      {rows.length === 0 ? (
        <div className="mt-3 rounded-card border border-border bg-card p-4">
          <p>{t(`admin.menu.empty.${type}`)}</p>
          <AddProductLink type={type} label={t("admin.menu.addProduct")} />
        </div>
      ) : (
        <ul ref={list} aria-labelledby={headingId} className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
          {ordered.map((row, index) => (
            <ProductRow
              key={row.id}
              row={row}
              onActions={props.onActions}
              handle={{ type, dragging: drag.dragging === index, pointer: drag.handleProps(index), onKey: onKey(row.id) }}
            />
          ))}
        </ul>
      )}
      <RowActions row={open} onClose={props.onClose} onDelete={props.onDelete} mover={mover} />
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

/** Move up / Move down in the sheet (S-042 AC3, AC7): the non-drag way; disabled at the ends with the reason. */
function MoveButtons({ mover, name }: { mover: Mover; name: string }) {
  const { t } = useI18n();
  const first = mover.index === 0;
  const last = mover.index === mover.count - 1;
  return (
    <li className="grid gap-2">
      <p className="text-sm font-semibold" id="move-position">
        {t("admin.menu.position", { n: mover.index + 1, count: mover.count })}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={first} aria-describedby={first ? "move-first" : "move-position"} onClick={() => mover.move(-1)} aria-label={t("admin.menu.moveUpNamed", { name })}>
          <ArrowUp aria-hidden="true" />
          {t("admin.menu.moveUp")}
        </Button>
        <Button type="button" variant="outline" disabled={last} aria-describedby={last ? "move-last" : "move-position"} onClick={() => mover.move(1)} aria-label={t("admin.menu.moveDownNamed", { name })}>
          <ArrowDown aria-hidden="true" />
          {t("admin.menu.moveDown")}
        </Button>
      </div>
      {first && (
        <p id="move-first" className="text-sm">
          {t("admin.menu.alreadyFirst")}
        </p>
      )}
      {last && (
        <p id="move-last" className="text-sm">
          {t("admin.menu.alreadyLast")}
        </p>
      )}
    </li>
  );
}

function RowActions({ row, onClose, onDelete, mover }: { row: AdminMenuRow | null; onClose: () => void; onDelete: (row: AdminMenuRow) => void; mover?: Mover | null }) {
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
          {mover && mover.count > 1 && <MoveButtons mover={mover} name={name} />}
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
  const { announce, region } = useAnnouncer();
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
      {region}
      {PRODUCT_TYPES.map((type) => (
        <TypeGroup
          key={type}
          type={type}
          rows={loaderData.byType[type].filter((row) => row.id !== goneId)}
          selected={selected}
          onActions={setSelected}
          onClose={() => setSelected(null)}
          onDelete={(row) => {
            setSelected(null);
            setToDelete(row);
          }}
          announce={announce}
        />
      ))}
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
