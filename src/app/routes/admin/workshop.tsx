import { CalendarCheck, ChevronLeft, Eye, EyeOff, Printer, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, data, useFetcher, useNavigate, useNavigation } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import type { ImageState } from "~/components/admin/site-image-field";
import { LeaveDialog, keepAboveSaveBar, useUnsavedGuard } from "~/components/admin/unsaved-guard";
import { EDITOR_ANCHORS, type EditorValues, EventEditorFields } from "~/components/admin/workshops/event-editor";
import { OptionTotals, type RegistrationView, RegistrationList } from "~/components/admin/workshops/registrations";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { showToast } from "~/components/ui/toaster";
import { formatDayLabel, formatLongDate, todayMU } from "~/domain/time";
import { whatsappLinkFor } from "~/domain/whatsapp";
import { WORKSHOP_LIMITS, holdsPlace, inLocale, placesLeft, timeRange } from "~/domain/workshop";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { publicImageUrl } from "~/lib/images";
import type { Locale } from "~/lib/locale";
import { isPendingIntent } from "~/lib/pending";
import { actionError } from "~/server/action-result.server";
import { afterResponseContext } from "~/server/after-response.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { Uuid } from "~/server/contracts/shared";
import { CancelEventInput, EventVersionInput, flatForm, parseWorkshopEvent } from "~/server/contracts/workshops";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { type AdminEvent, findAdminEvent, listEventRegistrations } from "~/server/repos/workshops.server";
import { storageContext, uploadContext } from "~/server/storage.server";
import { type EventActionResult, cancelEvent, completeEvent, publishEvent, saveWorkshopEvent, unpublishEvent } from "~/server/services/workshop-events.server";
import type { Route } from "./+types/workshop";

/** `admin/workshop` (E-15 S-301, S-305, S-306): one event: status actions, registrations, editor. Owner and Admin. */
export const handle = { titleKey: "admin.nav.workshops" };

function editorValues(event: AdminEvent | null, supabaseUrl: string): EditorValues {
  return {
    id: event?.id ?? null,
    version: event?.version ?? null,
    titleEn: event?.titleEn ?? "",
    titleFr: event?.titleFr ?? "",
    descriptionEn: event?.descriptionEn ?? "",
    descriptionFr: event?.descriptionFr ?? "",
    photoPath: event?.photoPath ?? null,
    photoUrl: event?.photoPath ? publicImageUrl(event.photoPath, supabaseUrl) : null,
    eventOn: event?.eventOn ?? "",
    startsAt: event?.startsAt ?? "14:00",
    endsAt: event?.endsAt ?? "16:00",
    address: event?.address ?? "",
    mapUrl: event?.mapUrl ?? "",
    priceRs: event ? String(event.priceRs) : "",
    capacity: event ? String(event.capacity) : "10",
    options: event?.cakeOptions.map((o) => ({ id: o.id, en: o.name.en, fr: o.name.fr ?? "" })) ?? [],
  };
}

/** The WhatsApp message in the registrant's language: cancelled, changed (the new date, time and place) or a plain hello. */
function whatsappText(locale: Locale, event: AdminEvent, changed: boolean): string {
  const title = inLocale(event.titleEn, event.titleFr, locale);
  if (event.status === "cancelled") return translate("admin.workshops.waCancelled", locale, { title });
  if (changed) return translate("admin.workshops.waChanged", locale, { title, date: formatLongDate(event.eventOn, locale), time: timeRange(event.startsAt, event.endsAt, locale), address: event.address });
  return translate("admin.workshops.waHello", locale, { title });
}

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const db = args.context.get(requestDbContext).db;
  const id = args.params.id;
  if (id !== undefined && !Uuid.safeParse(id).success) throw data(null, { status: 404 });
  const event = id ? await findAdminEvent(db, id) : null;
  if (id && !event) throw data(null, { status: 404 });
  const today = todayMU(args.context.get(clockContext).now());
  const regs = event ? await listEventRegistrations(db, event.id) : [];
  const totals = new Map<string, number>();
  const registrations: RegistrationView[] = regs.map((r) => {
    const active = holdsPlace(r.status);
    const choices = r.choices.map((c) => `${localized(c.name, me.locale)} × ${c.quantity}`);
    if (active) for (const c of r.choices) totals.set(localized(c.name, me.locale), (totals.get(localized(c.name, me.locale)) ?? 0) + c.quantity);
    const changed = active && r.changed;
    return { ...r, active, changed, choices, whatsappUrl: event ? whatsappLinkFor(r.contactPhone, whatsappText(r.locale, event, changed)) : null };
  });
  return {
    title: event ? event.titleEn : translate("admin.workshops.newTitle", me.locale),
    values: editorValues(event, args.context.get(publicConfigContext).supabaseUrl),
    event: event
      ? {
          id: event.id,
          slug: event.slug,
          status: event.status,
          version: event.version,
          held: event.held,
          capacity: event.capacity,
          left: placesLeft(event.capacity, event.held),
          dateLabel: formatDayLabel(event.eventOn, me.locale),
          timeLabel: timeRange(event.startsAt, event.endsAt, me.locale),
          canPublish: event.status === "draft" && event.eventOn >= today,
          canComplete: event.status === "published" && event.eventOn <= today,
          cancelReason: event.cancelReason,
        }
      : null,
    registrations,
    totals: [...totals].map(([name, cakes]) => ({ name, cakes })),
  };
}

const FIELD_MESSAGE: Record<string, string> = { endsAt: "admin.workshops.errors.endsAt", options: "admin.workshops.errors.options", mapUrl: "admin.workshops.errors.mapUrl" };

function eventRefusal(result: Exclude<EventActionResult, { ok: true }>, intent: string, locale: Locale) {
  if (result.code === "EVENT_CHANGED") return actionError("EVENT_CHANGED", locale, { extra: { intent } });
  if (result.code === "NOT_FOUND") return actionError("NOT_FOUND", locale, { extra: { intent } });
  return actionError("INVALID_TRANSITION", locale, { fields: { form: translate(`admin.workshops.cannot.${intent}`, locale) }, extra: { intent } });
}

async function saveAction(args: Route.ActionArgs, form: ReturnType<typeof flatForm>, me: Awaited<ReturnType<typeof requireAdmin>>) {
  const parsed = parseWorkshopEvent(form);
  if (!parsed.ok) {
    const fields = Object.fromEntries(parsed.fields.map((f) => [f, translate(FIELD_MESSAGE[f] ?? "admin.workshops.errors.field", me.locale, { field: translate(`admin.workshops.field.${f}`, me.locale) })]));
    return actionError("VALIDATION_FAILED", me.locale, { fields, extra: { intent: "save" } });
  }
  // An edit saves to the event in the URL only, never to an id posted from another page.
  if ((args.params.id ?? null) !== parsed.data.id) return actionError("VALIDATION_FAILED", me.locale, { extra: { intent: "save" } });
  const session = Uuid.safeParse(form.uploadSessionId);
  const result = await saveWorkshopEvent(args.context.get(requestDbContext).db, parsed.data, {
    adminId: me.id,
    now: args.context.get(clockContext).now(),
    uploadSessionId: session.success ? session.data.toLowerCase() : undefined,
    uploads: args.context.get(uploadContext),
    storage: args.context.get(storageContext),
    after: args.context.get(afterResponseContext),
  });
  if (result.ok) {
    console.log(JSON.stringify({ level: "info", event: "workshop_saved", id: result.id, isNew: !parsed.data.id, actorRole: me.role }));
    return { ok: true as const, intent: "save" as const, id: result.id, created: !parsed.data.id, told: result.told };
  }
  if (result.code === "CAPACITY_BELOW_HELD") return actionError("VALIDATION_FAILED", me.locale, { fields: { capacity: translate("admin.workshops.errors.capacityHeld", me.locale, { count: result.held }) }, extra: { intent: "save" } });
  if (result.code === "UPLOAD_REJECTED") return actionError("UPLOAD_REJECTED", me.locale, { fields: { photoPath: translate("admin.promotions.imageRejected", me.locale) }, extra: { intent: "save" } });
  return actionError(result.code, me.locale, { extra: { intent: "save" } });
}

/** Intents: save (create or edit), publish, unpublish, cancelEvent (optional reason), complete. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = flatForm(await args.request.formData());
  const intent = typeof form.intent === "string" ? form.intent : "";
  if (intent === "save") return saveAction(args, form, me);
  const id = Uuid.safeParse(args.params.id);
  if (!id.success) return actionError("NOT_FOUND", me.locale, { extra: { intent } });
  const db = args.context.get(requestDbContext).db;
  const now = args.context.get(clockContext).now();
  const today = todayMU(now);
  const base = { eventId: id.data, adminId: me.id, now };
  let result: EventActionResult;
  if (intent === "cancelEvent") {
    const input = CancelEventInput.safeParse(form);
    if (!input.success) return actionError("VALIDATION_FAILED", me.locale, { fields: { reason: translate("admin.order.reasonTooLong", me.locale) }, extra: { intent } });
    result = await cancelEvent(db, { ...base, version: input.data.version, reason: input.data.reason || null });
  } else if (intent === "publish" || intent === "unpublish" || intent === "complete") {
    const input = EventVersionInput.safeParse(form);
    if (!input.success) return actionError("VALIDATION_FAILED", me.locale, { extra: { intent } });
    const step = { ...base, version: input.data.version, today };
    result = intent === "publish" ? await publishEvent(db, step) : intent === "unpublish" ? await unpublishEvent(db, step) : await completeEvent(db, step);
  } else {
    return actionError("VALIDATION_FAILED", me.locale);
  }
  if (!result.ok) return eventRefusal(result, intent, me.locale);
  console.log(JSON.stringify({ level: "info", event: "workshop_action", action: intent, id: id.data, actorRole: me.role }));
  return { ok: true as const, intent, status: result.status };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type EventData = NonNullable<LoaderData["event"]>;
type Answer = { ok: true; intent: string; id?: string; created?: boolean; status?: string; told?: number } | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

function CancelDialog({ event, open, onClose }: { event: EventData; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  return (
    <Modal open={open} onClose={onClose} title={t("admin.workshops.cancelTitle")} closeLabel={t("admin.states.close")} variant="dialog">
      <Form method="post" onSubmit={onClose} className="grid gap-4">
        <input type="hidden" name="intent" value="cancelEvent" />
        <input type="hidden" name="version" value={event.version} />
        <p>{t("admin.workshops.cancelBody", { count: event.held })}</p>
        <TextField id="ws-cancel-reason" name="reason" label={t("admin.workshops.cancelReason")} optionalLabel={t("admin.promotions.optional")} maxLength={WORKSHOP_LIMITS.cancelReasonMax} multiline rows={3} />
        <div className="flex flex-wrap gap-3">
          <SubmitButton variant="destructive" pending={isPendingIntent(navigation, "cancelEvent")} pendingText={t("admin.order.working")}>
            {t("admin.workshops.cancelConfirm")}
          </SubmitButton>
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center px-3 font-semibold link">
            {t("admin.workshops.keep")}
          </button>
        </div>
      </Form>
    </Modal>
  );
}

function StatusActions({ event, answer }: { event: EventData; answer: Answer | undefined }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const [cancelling, setCancelling] = useState(false);
  const pending = (intent: string) => isPendingIntent(navigation, intent);
  const editable = event.status === "draft" || event.status === "published";
  return (
    <section aria-labelledby="ws-status" className="mt-6 grid gap-3 rounded-card border border-border bg-card p-4">
      <h2 id="ws-status" className="text-lg">
        {t("admin.workshops.statusLine", { status: t(`admin.workshops.status.${event.status}`) })}
      </h2>
      <p>
        {event.dateLabel}, {event.timeLabel} · {t("admin.workshops.held", { held: event.held, capacity: event.capacity })}
      </p>
      {event.status === "cancelled" && event.cancelReason && <p>{t("admin.workshops.cancelledBecause", { reason: event.cancelReason })}</p>}
      {answer && !answer.ok && <Alert tone="danger" role="alert" title={answer.error.fields?.form ?? answer.error.message} />}
      <div className="flex flex-wrap gap-3">
        {event.canPublish && (
          <Form method="post">
            <input type="hidden" name="version" value={event.version} />
            <SubmitButton name="intent" value="publish" size="lg" pending={pending("publish")} pendingText={t("admin.order.working")}>
              <Eye aria-hidden="true" />
              {t("admin.workshops.publish")}
            </SubmitButton>
          </Form>
        )}
        {event.status === "published" && (
          <Form method="post">
            <input type="hidden" name="version" value={event.version} />
            <SubmitButton name="intent" value="unpublish" variant="outline" size="lg" pending={pending("unpublish")} pendingText={t("admin.order.working")}>
              <EyeOff aria-hidden="true" />
              {t("admin.workshops.unpublish")}
            </SubmitButton>
          </Form>
        )}
        {event.canComplete && (
          <Form method="post">
            <input type="hidden" name="version" value={event.version} />
            <SubmitButton name="intent" value="complete" variant="outline" size="lg" pending={pending("complete")} pendingText={t("admin.order.working")}>
              <CalendarCheck aria-hidden="true" />
              {t("admin.workshops.complete")}
            </SubmitButton>
          </Form>
        )}
        <Link to={`/admin/workshops/${event.id}/list`} className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-input bg-card px-4 font-semibold hover:bg-accent">
          <Printer aria-hidden="true" className="size-5" />
          {t("admin.workshops.printList")}
        </Link>
        {event.status === "published" && (
          <a href={`/workshops/${event.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center font-semibold link">
            {t("admin.workshops.viewOnSite")}
          </a>
        )}
        {editable && (
          <button type="button" onClick={() => setCancelling(true)} className="ml-auto inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-destructive px-4 font-semibold text-destructive hover:bg-destructive/10">
            <XCircle aria-hidden="true" className="size-5" />
            {t("admin.workshops.cancel")}
          </button>
        )}
      </div>
      <CancelDialog event={event} open={cancelling} onClose={() => setCancelling(false)} />
    </section>
  );
}

/**
 * Save answers already acted on. The editor remounts when the saved event's version arrives
 * (its key), so the fetcher is keyed to outlive that remount and its answer is handled once
 * here, not per mount: the "Saved" toast shows after an edit too.
 */
const handledSaves = new WeakSet<object>();

function Editor({ loaderData }: { loaderData: LoaderData }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetcher = useFetcher<Answer>({ key: `workshop-editor-save:${loaderData.values.id ?? "new"}` });
  const [dirty, setDirty] = useState(false);
  const [photo, setPhoto] = useState<ImageState>("idle");
  const { blocker, dirtyRef } = useUnsavedGuard(dirty);
  const summary = useRef<HTMLDivElement>(null);
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  useEffect(() => {
    if (!result || handledSaves.has(result)) return;
    handledSaves.add(result);
    if (result.ok) {
      // The revalidated page remounts the editor (its key carries the new version), clean.
      dirtyRef.current = false;
      // A date, time or place change emailed the active registrants: say how many (instant feedback).
      showToast(result.told ? t("admin.workshops.savedTold", { count: result.told }) : t("admin.workshops.saved"));
      if (result.created && result.id) void navigate(`/admin/workshops/${result.id}`);
    } else summary.current?.focus();
  });
  const refusal = result && !result.ok ? result.error : undefined;
  const values = loaderData.values;
  const markDirty = () => setDirty(true);
  return (
    <section aria-labelledby="ws-edit" className="mt-8">
      <h2 id="ws-edit" className="text-xl">
        {values.id ? t("admin.workshops.editSection") : t("admin.workshops.newSection")}
      </h2>
      {refusal && <ErrorSummary ref={summary} message={refusal.message} fields={refusal.fields} anchors={EDITOR_ANCHORS} title={t("admin.promotions.errorSummaryTitle")} />}
      <fetcher.Form method="post" onChange={markDirty} onInput={markDirty} onFocus={keepAboveSaveBar} className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-8" noValidate>
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="id" value={values.id ?? ""} />
        <input type="hidden" name="version" value={values.version ?? ""} />
        <EventEditorFields values={values} errors={refusal?.fields ?? {}} onPhoto={(state) => { setPhoto(state); markDirty(); }} />
        <div data-editor-bar="" className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card px-4 py-3 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
          <SubmitButton pending={fetcher.state !== "idle" || photo === "working"} pendingText={photo === "working" ? t("admin.settings.image.working") : t("admin.product.savingLabel")} pendingLabel={photo === "working" ? t("admin.settings.image.working") : t("admin.product.savingLabel")} className="w-full md:w-auto">
            {t("admin.workshops.save")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      <LeaveDialog blocker={blocker} />
    </section>
  );
}

export default function AdminWorkshop({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { event } = loaderData;
  const answer = actionData as Answer | undefined;
  const editable = !event || event.status === "draft" || event.status === "published";
  return (
    <>
      <Link to="/admin/workshops" className="inline-flex min-h-11 items-center gap-1 font-semibold link">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("admin.workshops.back")}
      </Link>
      <h1 className="mt-2 wrap-anywhere">{loaderData.title}</h1>
      {event && <StatusActions key={event.version} event={event} answer={answer} />}
      {event && (
        <section aria-labelledby="ws-regs" className="mt-8">
          <h2 id="ws-regs" className="text-xl">
            {t("admin.workshops.registrations", { count: loaderData.registrations.length })}
          </h2>
          <p className="mt-1">{t("admin.workshops.placesLeft", { count: event.left })}</p>
          <OptionTotals totals={loaderData.totals} />
          <RegistrationList registrations={loaderData.registrations} cancelled={event.status === "cancelled"} />
        </section>
      )}
      {editable && <Editor key={`${loaderData.values.id ?? "new"}:${loaderData.values.version ?? 0}`} loaderData={loaderData} />}
    </>
  );
}
