import { CalendarX2, Trash2 } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { SettingsSection } from "~/components/admin/settings-fields";
import { LeaveDialog, useUnsavedGuard } from "~/components/admin/unsaved-guard";
import { WindowsEditor } from "~/components/admin/windows-editor";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { CheckboxRow } from "~/components/ui/checkbox-row";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { showToast } from "~/components/ui/toaster";
import { BLOCK_REASON_MAX, NOTICE_DAYS_LIMIT, WEEKDAYS } from "~/domain/availability";
import { formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { type AdminUser, requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { BlockIdInput, parseAvailabilityForm, parseBlockForm } from "~/server/contracts/settings";
import { requestDbContext } from "~/server/db.server";
import { fieldMessages } from "~/server/field-messages.server";
import { readAvailabilityRules } from "~/server/repos/owner-settings.server";
import { addBlock, listBlocks, removeBlock } from "~/server/services/blocked-dates.server";
import { type OrderBrief, saveAvailabilityRules } from "~/server/services/save-availability.server";
import type { Route } from "./+types/availability";

/** `admin/availability` (**owner**): notice, closed days and windows (S-056); blocked dates (S-057). */
export const handle = { titleKey: "admin.nav.availability" };

/** "Thu 24 Dec", with the year when it is not this year's. */
function dayLabel(date: string, locale: Locale, thisYear: string): string {
  const label = formatDayLabel(date, locale);
  return date.slice(0, 4) === thisYear ? label : `${label} ${date.slice(0, 4)}`;
}

function rangeLabel(block: { startsOn: string; endsOn: string }, locale: Locale, thisYear: string): string {
  const start = dayLabel(block.startsOn, locale, thisYear);
  return block.startsOn === block.endsOn ? start : translate("admin.availability.range", locale, { start, end: dayLabel(block.endsOn, locale, thisYear) });
}

function withLabels(orders: OrderBrief[], locale: Locale, thisYear: string) {
  return orders.map((order) => ({ ...order, dateLabel: dayLabel(order.fulfilOn, locale, thisYear) }));
}

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args, { role: "owner" });
  const db = args.context.get(requestDbContext).db;
  const thisYear = todayMU(args.context.get(clockContext).now()).slice(0, 4);
  const [rules, blocks] = await Promise.all([readAvailabilityRules(db), listBlocks(db)]);
  return {
    title: translate(handle.titleKey, me.locale),
    ...rules,
    blocks: blocks.map((block) => ({ ...block, label: rangeLabel(block, me.locale, thisYear) })),
  };
}

const refuse = (me: AdminUser, intent: string, fields: Record<string, string>) => actionError("VALIDATION_FAILED", me.locale, { fields: fieldMessages(fields, me.locale, "availability"), extra: { intent } });

async function saveRules(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const parsed = parseAvailabilityForm(form);
  if (!parsed.ok) return refuse(me, "saveRules", parsed.problems);
  const now = args.context.get(clockContext).now();
  const today = todayMU(now);
  const result = await saveAvailabilityRules(args.context.get(requestDbContext).db, parsed.version, parsed.input, { adminId: me.id, now, today });
  if (!result.ok) return actionError(result.code, me.locale, { extra: { intent: "saveRules" } });
  return { ok: true as const, intent: "saveRules" as const, version: result.version, affectedOrders: withLabels(result.affectedOrders, me.locale, today.slice(0, 4)) };
}

async function block(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const parsed = parseBlockForm(form);
  if (!parsed.ok) return refuse(me, "addBlock", parsed.problems);
  const now = args.context.get(clockContext).now();
  const result = await addBlock(args.context.get(requestDbContext).db, parsed.input, { adminId: me.id, now });
  const thisYear = todayMU(now).slice(0, 4);
  return { ok: true as const, intent: "addBlock" as const, label: rangeLabel(result.block, me.locale, thisYear), existingOrders: withLabels(result.existingOrders, me.locale, thisYear) };
}

async function unblock(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const id = BlockIdInput.safeParse({ id: form.get("id") });
  if (!id.success) return actionError("VALIDATION_FAILED", me.locale, { extra: { intent: "removeBlock" } });
  const result = await removeBlock(args.context.get(requestDbContext).db, id.data.id);
  if (!result.ok) return actionError("NOT_FOUND", me.locale, { extra: { intent: "removeBlock" } });
  return { ok: true as const, intent: "removeBlock" as const, id: result.id };
}

/** `saveRules` · `addBlock` · `removeBlock`; every answer carries its `intent`. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args, { role: "owner" });
  const form = await args.request.formData();
  const intent = form.get("intent");
  if (intent === "saveRules") return saveRules(args, me, form);
  if (intent === "addBlock") return block(args, me, form);
  if (intent === "removeBlock") return unblock(args, me, form);
  return actionError("VALIDATION_FAILED", me.locale);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type Refusal = { code: string; message: string; fields?: Record<string, string> };
type Answer<T> = (T & { ok: true }) | { ok: false; error: Refusal };
type BriefView = OrderBrief & { dateLabel: string };
type Errors = Record<string, string | undefined>;

const RULE_ANCHORS: Record<string, string> = {
  defaultNoticeDays: "notice-days",
  closedWeekdays: "closed-days",
  deliveryWindows: "delivery",
  pickupWindows: "pickup",
  version: "availability-title",
};

/** Window fields link to their input: `deliveryWindows.1.start` -> `delivery-1-start`. */
function ruleAnchors(fields: Record<string, string> | undefined): Record<string, string> {
  const extra = Object.keys(fields ?? {}).flatMap((field) => {
    const match = /^(delivery|pickup)Windows\.(\d+)\.(label\.en|label\.fr|start|end|id)$/.exec(field);
    return match ? [[field, `${match[1]}-${match[2]}-${match[3].replace(".", "-")}`] as const] : [];
  });
  return { ...RULE_ANCHORS, ...Object.fromEntries(extra) };
}

/** Focus on the refusal; run `onDone` once per successful answer. */
function useAnswer<T>(fetcher: { state: string; data?: unknown }, onDone: (answer: T & { ok: true }) => void) {
  const focus = useRef<HTMLDivElement>(null);
  const handled = useRef<unknown>(null);
  const answer = fetcher.state === "idle" ? (fetcher.data as Answer<T> | undefined) : undefined;
  useEffect(() => {
    if (!answer || handled.current === answer) return;
    handled.current = answer;
    if (answer.ok) onDone(answer);
    else focus.current?.focus();
  });
  return { answer, refusal: answer && !answer.ok ? answer.error : undefined, focus };
}

function OrdersWarning({ title, body, orders }: { title: string; body: string; orders: BriefView[] }) {
  const { t } = useI18n();
  if (orders.length === 0) return null;
  return (
    <Alert tone="warning" role="status" title={title} className="mt-4">
      <p>{body}</p>
      <ul className="mt-2 grid gap-1">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`/admin/orders/${order.id}`} className="inline-flex min-h-11 items-center font-semibold link wrap-anywhere">
              {t("admin.availability.orderLine", { number: order.number, name: order.contactName, date: order.dateLabel })}
            </Link>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function ChangedAlert({ refusal, focusRef, onReload }: { refusal: Refusal; focusRef: RefObject<HTMLDivElement | null>; onReload: () => void }) {
  const { t } = useI18n();
  return (
    <Alert ref={focusRef} tone="danger" role="alert" tabIndex={-1} title={refusal.message} className="mt-4 outline-offset-2">
      <p>{t("admin.settings.changedBody")}</p>
      <a href="/admin/availability" onClick={onReload} className="mt-2 inline-flex min-h-11 items-center font-semibold link">
        {t("admin.settings.reload")}
      </a>
    </Alert>
  );
}

function ClosedDays({ closed, error }: { closed: number[]; error?: string }) {
  const { t } = useI18n();
  return (
    <fieldset id="closed-days" tabIndex={-1} className="min-w-0 outline-offset-2" aria-describedby={`closed-days-hint${error ? " closed-days-error" : ""}`}>
      <legend className="text-lg font-semibold">{t("admin.availability.closedDays")}</legend>
      <p id="closed-days-hint" className="text-sm text-muted-foreground">
        {t("admin.availability.closedDaysHint")}
      </p>
      {error && (
        <p id="closed-days-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
      <ul className="mt-2 grid gap-1 min-[30rem]:grid-cols-2 md:grid-cols-4">
        {WEEKDAYS.map((day) => (
          <li key={day}>
            <CheckboxRow name="closedWeekdays" value={day} defaultChecked={closed.includes(day)}>
              <span className="sr-only">{t("admin.availability.closedOn")} </span>
              {t(`admin.availability.weekday.${day}`)}
            </CheckboxRow>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function RulesForm({ loaderData }: { loaderData: LoaderData }) {
  const { t } = useI18n();
  const fetcher = useFetcher({ key: "availability-rules" });
  const [dirty, setDirty] = useState(false);
  const { blocker, dirtyRef } = useUnsavedGuard(dirty);
  const [affected, setAffected] = useState<BriefView[]>([]);
  const { answer, refusal, focus } = useAnswer<{ version: number; affectedOrders: BriefView[] }>(fetcher, (saved) => {
    dirtyRef.current = false;
    setDirty(false);
    setAffected(saved.affectedOrders);
    showToast(t("admin.availability.saved"));
  });
  const errors: Errors = refusal?.fields ?? {};
  const version = answer?.ok ? answer.version : loaderData.version;
  const markDirty = () => setDirty(true);
  return (
    <>
      {refusal?.code === "SETTINGS_CHANGED" ? (
        <ChangedAlert refusal={refusal} focusRef={focus} onReload={() => (dirtyRef.current = false)} />
      ) : refusal ? (
        <ErrorSummary ref={focus} message={refusal.message} fields={refusal.fields} anchors={ruleAnchors(refusal.fields)} title={t("admin.settings.errorSummaryTitle")} />
      ) : null}
      <OrdersWarning title={t("admin.availability.affectedTitle")} body={t("admin.availability.affectedBody")} orders={affected} />
      <fetcher.Form method="post" noValidate onChange={markDirty} onInput={markDirty} className="mt-6 grid gap-6">
        <input type="hidden" name="intent" value="saveRules" />
        <input type="hidden" name="version" value={version} />
        <SettingsSection id="rules" title={t("admin.availability.rulesTitle")}>
          <TextField id="notice-days" name="defaultNoticeDays" label={t("admin.availability.notice")} hint={t("admin.availability.noticeHint", { max: NOTICE_DAYS_LIMIT })} inputMode="numeric" pattern="[0-9]*" autoComplete="off" defaultValue={loaderData.defaultNoticeDays} error={errors.defaultNoticeDays} className="max-w-sm" />
          <ClosedDays closed={loaderData.closedWeekdays} error={errors.closedWeekdays} />
        </SettingsSection>
        <SettingsSection id="windows" title={t("admin.availability.windowsTitle")} intro={t("admin.availability.windowsIntro")}>
          <WindowsEditor list="deliveryWindows" initial={loaderData.deliveryWindows} errors={errors} onChange={markDirty} />
          <WindowsEditor list="pickupWindows" initial={loaderData.pickupWindows} errors={errors} onChange={markDirty} />
        </SettingsSection>
        <div>
          <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.settings.saving")} pendingLabel={t("admin.settings.saving")} className="h-auto min-h-11 w-full whitespace-normal sm:w-auto">
            {t("admin.availability.saveRules")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      <LeaveDialog blocker={blocker} />
    </>
  );
}

function AddBlockForm() {
  const { t } = useI18n();
  const fetcher = useFetcher({ key: "availability-add-block" });
  const form = useRef<HTMLFormElement>(null);
  const [existing, setExisting] = useState<BriefView[]>([]);
  const [said, setSaid] = useState("");
  const { refusal, focus } = useAnswer<{ label: string; existingOrders: BriefView[] }>(fetcher, (added) => {
    form.current?.reset();
    setExisting(added.existingOrders);
    setSaid(t("admin.availability.blockAdded", { range: added.label }));
  });
  const errors: Errors = refusal?.fields ?? {};
  const dateField = (id: string, name: string, label: string) => (
    <div className="min-w-0">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t("admin.availability.dateHint")}
      </p>
      <input id={id} name={name} type="date" aria-invalid={errors[name] ? true : undefined} aria-describedby={`${id}-hint${errors[name] ? ` ${id}-error` : ""}`} className="mt-2 block min-h-12 w-full max-w-60 min-w-0 rounded-md border-2 border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive" />
      {errors[name] && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive">
          {errors[name]}
        </p>
      )}
    </div>
  );
  return (
    <>
      {refusal && <ErrorSummary ref={focus} message={refusal.message} fields={refusal.fields} anchors={{ startsOn: "block-start", endsOn: "block-end", reason: "block-reason" }} title={t("admin.settings.errorSummaryTitle")} />}
      <fetcher.Form ref={form} method="post" noValidate className="mt-2 grid gap-4">
        <input type="hidden" name="intent" value="addBlock" />
        <div className="grid gap-4 min-[30rem]:grid-cols-2 md:max-w-xl">
          {dateField("block-start", "startsOn", t("admin.availability.blockStart"))}
          {dateField("block-end", "endsOn", t("admin.availability.blockEnd"))}
        </div>
        <TextField id="block-reason" name="reason" label={t("admin.availability.reason")} optionalLabel={t("admin.product.optional")} hint={t("admin.availability.reasonHint", { max: BLOCK_REASON_MAX })} maxLength={BLOCK_REASON_MAX} autoComplete="off" error={errors.reason} />
        <div>
          <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.availability.blocking")} pendingLabel={t("admin.availability.blocking")} className="h-auto min-h-11 w-full whitespace-normal sm:w-auto">
            <CalendarX2 aria-hidden="true" />
            {t("admin.availability.addBlock")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      <p role="status" aria-live="polite" className="mt-2 font-semibold">
        {said}
      </p>
      <OrdersWarning title={t("admin.availability.existingTitle")} body={t("admin.availability.existingBody")} orders={existing} />
    </>
  );
}

type Block = LoaderData["blocks"][number];

function BlockList({ blocks }: { blocks: Block[] }) {
  const { t } = useI18n();
  const fetcher = useFetcher({ key: "availability-remove-block" });
  const [confirming, setConfirming] = useState<Block | null>(null);
  const [said, setSaid] = useState("");
  const removing = fetcher.state !== "idle" ? String(fetcher.formData?.get("id") ?? "") : null;
  const { refusal, focus } = useAnswer<{ id: string }>(fetcher, () => setSaid(t("admin.availability.blockRemoved")));
  // Instant feedback: the row leaves as soon as Remove is confirmed; a refusal brings it back.
  const shown = blocks.filter((block) => block.id !== removing);
  return (
    <>
      {refusal && (
        <Alert ref={focus} tone="danger" role="alert" tabIndex={-1} title={refusal.message} className="mt-4 outline-offset-2">
          <p>{t("admin.availability.removeFailed")}</p>
        </Alert>
      )}
      <h3 className="mt-6 text-lg font-semibold">{t("admin.availability.blockedListTitle")}</h3>
      {shown.length === 0 ? (
        <p className="mt-2">{t("admin.availability.noBlocks")}</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {shown.map((block) => (
            <li key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-input p-2 min-[20rem]:p-3">
              <div className="min-w-0 flex-[1_1_12rem]">
                <p className="font-semibold">{block.label}</p>
                {block.reason && <p className="wrap-anywhere text-sm">{block.reason}</p>}
              </div>
              <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => setConfirming(block)} aria-label={t("admin.availability.removeBlockLabel", { range: block.label })}>
                <Trash2 aria-hidden="true" />
                {t("admin.availability.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
      <Modal open={confirming !== null} onClose={() => setConfirming(null)} title={t("admin.availability.removeTitle")} closeLabel={t("admin.states.close")} variant="dialog" returnFocusTo={() => "blocked-title"}>
        <p>{t("admin.availability.removeBody", { range: confirming?.label ?? "" })}</p>
        <fetcher.Form method="post" className="mt-4 flex flex-wrap gap-2" onSubmit={() => setConfirming(null)}>
          <input type="hidden" name="intent" value="removeBlock" />
          <input type="hidden" name="id" value={confirming?.id ?? ""} />
          <Button type="button" variant="outline" onClick={() => setConfirming(null)} className="h-auto min-h-11 flex-1 whitespace-normal">
            {t("admin.availability.keep")}
          </Button>
          <Button type="submit" className="h-auto min-h-11 flex-1 whitespace-normal">
            {t("admin.availability.confirmRemove")}
          </Button>
        </fetcher.Form>
      </Modal>
    </>
  );
}

export default function AdminAvailability({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 id="availability-title" tabIndex={-1}>
        {t("admin.availability.title")}
      </h1>
      <p className="mt-1 max-w-measure">{t("admin.availability.intro")}</p>
      <RulesForm loaderData={loaderData} />
      <section aria-labelledby="blocked-title" className="mt-6 min-w-0 rounded-card border border-border bg-card p-2 min-[20rem]:p-4 sm:p-6">
        <h2 id="blocked-title" tabIndex={-1}>
          {t("admin.availability.blockedTitle")}
        </h2>
        <p className="mt-1 max-w-measure">{t("admin.availability.blockedIntro")}</p>
        <AddBlockForm />
        <BlockList blocks={loaderData.blocks} />
      </section>
    </div>
  );
}
