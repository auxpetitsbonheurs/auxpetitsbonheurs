import { ExternalLink } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { type AltTexts, PagePhotos } from "~/components/admin/page-photos";
import { BilingualField, SettingsSection } from "~/components/admin/settings-fields";
import { LeaveDialog, keepAboveSaveBar, useUnsavedGuard } from "~/components/admin/unsaved-guard";
import { usePagePhotoUploads } from "~/components/admin/use-page-photo-uploads";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { showToast } from "~/components/ui/toaster";
import {
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  PAGE_PHOTO_LIMITS,
  SITE_PAGE_FIELDS,
  SITE_PAGE_PATHS,
  type SitePageField,
  fieldMax,
  isSitePageKey,
  pageUploadScope,
} from "~/domain/site-pages";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { thumbnailUrl } from "~/lib/images";
import { actionError } from "~/server/action-result.server";
import { afterResponseContext } from "~/server/after-response.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { parseSitePageForm } from "~/server/contracts/site-pages";
import { requestDbContext } from "~/server/db.server";
import { pageFieldMessages } from "~/server/page-messages.server";
import { publicConfigContext } from "~/server/public-config.server";
import { readSitePageForEditor } from "~/server/repos/site-pages.server";
import { saveSitePage } from "~/server/services/save-site-page.server";
import { storageContext, uploadContext } from "~/server/storage.server";
import type { Route } from "./+types/page-editor";

/**
 * `admin/page-editor` (`/admin/pages/:key`, **admin**, E-13 S-246, S-247): one brand page's
 * text in English and French, its photos (S-047 upload rules) and, for Workshops, the next
 * workshop. One versioned Save. Its own route chunk: the product editor's JS is not touched.
 */
export const handle = { titleKey: "admin.pages.title" };

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const key = args.params.key;
  if (!isSitePageKey(key)) throw data(null, { status: 404 });
  const page = await readSitePageForEditor(args.context.get(requestDbContext).db, key);
  if (!page) throw data(null, { status: 404 });
  const { supabaseUrl } = args.context.get(publicConfigContext);
  const photo = (p: (typeof page.photos)[number]) => ({ path: p.path, url: thumbnailUrl(p.path, p.width, p.variantWidths, supabaseUrl), width: p.width, height: p.height, alt: p.alt });
  const name = translate(`admin.pages.names.${key}`, me.locale);
  return {
    title: name,
    key,
    fields: SITE_PAGE_FIELDS[key] as readonly SitePageField[],
    content: page.content,
    isPlaceholder: page.isPlaceholder,
    version: page.version,
    photoLimit: PAGE_PHOTO_LIMITS[key],
    photos: page.photos.filter((p) => p.role === "page").map(photo),
    event: page.event,
    eventPhoto: page.photos.filter((p) => p.role === "event").map(photo),
    publicPath: SITE_PAGE_PATHS[key] ?? null,
    isOwner: me.role === "owner",
  };
}

/** `save` → `{ ok, intent, version }`; VALIDATION_FAILED / UPLOAD_REJECTED with `fields`; PAGE_CHANGED 409; NOT_FOUND. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const key = args.params.key;
  if (!isSitePageKey(key)) return actionError("NOT_FOUND", me.locale);
  const form = await args.request.formData();
  if (form.get("intent") !== "save") return actionError("VALIDATION_FAILED", me.locale);
  const parsed = parseSitePageForm(form, key);
  if (!parsed.ok) return actionError("VALIDATION_FAILED", me.locale, { fields: pageFieldMessages(key, parsed.problems, me.locale) });
  const result = await saveSitePage(args.context.get(requestDbContext).db, key, parsed.version, parsed.input, {
    adminId: me.id,
    now: args.context.get(clockContext).now(),
    uploadSessionIds: parsed.uploadSessionIds,
    uploads: args.context.get(uploadContext),
    storage: args.context.get(storageContext),
    after: args.context.get(afterResponseContext),
  });
  if (!result.ok) return actionError(result.code, me.locale, "fields" in result ? { fields: pageFieldMessages(key, result.fields, me.locale) } : {});
  return { ok: true as const, intent: "save" as const, version: result.version };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type Errors = Record<string, string | undefined>;
type SaveAnswer = { ok: true; version: number } | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };
type SavedPhoto = LoaderData["photos"][number];

const FIELD_IDS: Record<SitePageField, string> = { intro: "intro", body: "body", hours: "hours", pickup_note: "pickup-note" };

/** Field name → element id for the error summary's links. */
function anchorsFor(fields: readonly SitePageField[]): Record<string, string> {
  const anchors: Record<string, string> = { photos: "photos", version: "page-title", uploadSessionId: "page-title", "event.date": "event-date", "event.seats": "event-seats", eventPhoto: "event-photo" };
  for (const field of fields) for (const lang of ["en", "fr"]) anchors[`${field}.${lang}`] = `${FIELD_IDS[field]}-${lang}`;
  for (const part of ["title", "text"]) for (const lang of ["en", "fr"]) anchors[`event.${part}.${lang}`] = `event-${part}-${lang}`;
  for (let n = 0; n < 6; n += 1) {
    anchors[`photos.${n}`] = "photos";
    for (const lang of ["en", "fr"]) anchors[`photos.${n}.alt.${lang}`] = `photos-${n}-alt-${lang}`;
  }
  for (const lang of ["en", "fr"]) anchors[`eventPhoto.alt.${lang}`] = `event-photo-0-alt-${lang}`;
  return anchors;
}

/** Polite live region for photo changes (moved, removed, uploaded). */
function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => {
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

/** Alt texts by photo key, starting from the saved ones (keys are the stored paths). */
function useAltTexts(saved: readonly SavedPhoto[]) {
  const [alts, setAlts] = useState<AltTexts>(() => Object.fromEntries(saved.map((p) => [p.path, { en: p.alt.en, fr: p.alt.fr }])));
  const setAlt = useCallback((key: string, alt: { en: string; fr: string }) => setAlts((current) => ({ ...current, [key]: alt })), []);
  return { alts, setAlt };
}

function ChangedAlert({ message, href, onReload, alertRef }: { message: string; href: string; onReload: () => void; alertRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  return (
    <Alert ref={alertRef} tone="danger" role="alert" tabIndex={-1} title={message} className="mt-6 outline-offset-2">
      <p>{t("admin.pages.changedBody")}</p>
      {/* A full load, only when the admin chooses it: the typed text stays until then (AC5). */}
      <a href={href} onClick={onReload} className="mt-2 inline-flex min-h-11 items-center font-semibold link">
        {t("admin.pages.reload")}
      </a>
    </Alert>
  );
}

function ContactNote({ isOwner }: { isOwner: boolean }) {
  const { t } = useI18n();
  return (
    <p className="max-w-measure rounded-md border border-border bg-muted p-3">
      {isOwner ? (
        <>
          {t("admin.pages.contactSettings.owner")}{" "}
          <Link to="/admin/settings#contact-title" className="inline-flex min-h-11 items-center font-semibold link">
            {t("admin.pages.contactSettings.ownerLink")}
          </Link>
        </>
      ) : (
        t("admin.pages.contactSettings.admin")
      )}
    </p>
  );
}

interface EventProps {
  loaderData: LoaderData;
  errors: Errors;
  eventPhotos: ReturnType<typeof usePagePhotoUploads>;
  eventAlts: ReturnType<typeof useAltTexts>;
  onChange: () => void;
  announce: (text: string) => void;
}

/** Workshops "next workshop" (S-249 Owner clarification): all blank = none planned. */
function NextWorkshop({ loaderData, errors, eventPhotos, eventAlts, onChange, announce }: EventProps) {
  const { t } = useI18n();
  const [generation, setGeneration] = useState(0);
  const [cleared, setCleared] = useState(false);
  const event = cleared ? null : loaderData.event;
  const clear = () => {
    setCleared(true);
    setGeneration((n) => n + 1);
    for (const item of eventPhotos.items) eventPhotos.remove(item.key);
    onChange();
    announce(t("admin.pages.event.cleared"));
  };
  return (
    <SettingsSection id="event" title={t("admin.pages.event.legend")} intro={t("admin.pages.event.hint")}>
      <div key={generation} className="grid gap-5">
        <BilingualField name="event.title" id="event-title" label={t("admin.pages.event.title")} max={EVENT_TITLE_MAX} value={event?.title ?? null} errors={errors} frEmptyHint={t("admin.pages.frEmpty")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="event-date" name="event.date" type="date" label={t("admin.pages.event.date")} defaultValue={event?.date ?? ""} error={errors["event.date"]} className="min-w-0 max-w-sm" />
          <TextField id="event-seats" name="event.seats" label={t("admin.pages.event.seats")} optionalLabel={t("admin.product.optional")} hint={t("admin.pages.event.seatsHint")} inputMode="numeric" pattern="[0-9]*" maxLength={3} autoComplete="off" defaultValue={event?.seats ?? ""} error={errors["event.seats"]} className="min-w-0 max-w-sm" />
        </div>
        <BilingualField name="event.text" id="event-text" label={t("admin.pages.event.text")} max={EVENT_TEXT_MAX} value={event?.text ?? null} multiline rows={3} errors={errors} frEmptyHint={t("admin.pages.frEmpty")} />
      </div>
      <PagePhotos id="event-photo" legend={t("admin.pages.event.photo")} hint={t("admin.pages.event.photoHint")} max={1} photos={eventPhotos} alts={eventAlts.alts} setAlt={eventAlts.setAlt} formName="eventPhoto" errors={errors} onChange={onChange} announce={announce} />
      <p>
        <Button type="button" variant="outline" onClick={clear} className="h-auto min-h-11 whitespace-normal">
          {t("admin.pages.event.clear")}
        </Button>
      </p>
    </SettingsSection>
  );
}

/** After a save: toast "Saved" (announced); on a refusal, focus the summary. */
function useSaveFeedback(fetcher: ReturnType<typeof useFetcher<SaveAnswer>>, onSaved: () => void) {
  const { t } = useI18n();
  const summary = useRef<HTMLDivElement>(null);
  const handled = useRef<unknown>(null);
  const answer = fetcher.data;
  useEffect(() => {
    if (fetcher.state !== "idle" || !answer || handled.current === answer) return;
    handled.current = answer;
    if (answer.ok) {
      showToast(t("admin.pages.saved"));
      onSaved();
    } else summary.current?.focus();
  });
  return { summary, answer: fetcher.state === "idle" ? answer : undefined };
}

function TextSections({ loaderData, errors }: { loaderData: LoaderData; errors: Errors }) {
  const { t } = useI18n();
  return (
    <SettingsSection id="texts" title={t("admin.pages.textTitle")}>
      {loaderData.key === "contact" && <ContactNote isOwner={loaderData.isOwner} />}
      {loaderData.key === "gallery" && <p className="max-w-measure">{t("admin.pages.galleryNote")}</p>}
      {loaderData.fields.map((field) => (
        <BilingualField
          key={field}
          name={field}
          id={FIELD_IDS[field]}
          label={t(`admin.pages.fields.${field}.label`)}
          hint={t(`admin.pages.fields.${field}.hint`)}
          max={fieldMax(field)}
          value={loaderData.content[field] ?? null}
          multiline
          rows={field === "intro" ? 3 : 8}
          errors={errors}
          frEmptyHint={t("admin.pages.frEmpty")}
        />
      ))}
    </SettingsSection>
  );
}

export default function AdminPageEditor({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const fetcher = useFetcher<SaveAnswer>();
  const [dirty, setDirty] = useState(false);
  const { blocker, dirtyRef } = useUnsavedGuard(dirty);
  const { announce, region } = useAnnouncer();
  const scope = pageUploadScope(loaderData.key);
  const say = useCallback((key: string, values: Record<string, string>) => announce(t(key, values)), [announce, t]);
  const photos = usePagePhotoUploads(loaderData.photos, Math.max(loaderData.photoLimit, 1), scope, say);
  const eventPhotos = usePagePhotoUploads(loaderData.eventPhoto, 1, scope, say);
  const pageAlts = useAltTexts(loaderData.photos);
  const eventAlts = useAltTexts(loaderData.eventPhoto);
  const [blocked, setBlocked] = useState(false);
  const { summary, answer } = useSaveFeedback(fetcher, () => {
    dirtyRef.current = false;
    setDirty(false);
    photos.settle();
    eventPhotos.settle();
  });
  const refusal = answer && !answer.ok ? answer.error : undefined;
  const saved = answer?.ok === true;
  const busy = photos.summary.busy || eventPhotos.summary.busy;
  const failed = photos.summary.failed + eventPhotos.summary.failed;
  const markDirty = () => {
    setDirty(true);
    setBlocked(false);
  };
  const errors: Errors = refusal?.fields ?? {};
  const sessions = [photos.sessionId(), eventPhotos.sessionId()].filter((s): s is string => s !== null);
  return (
    <div className="mx-auto max-w-4xl">
      <p>
        <Link to="/admin/pages" className="inline-flex min-h-11 items-center font-semibold link">
          {t("admin.pages.back")}
        </Link>
      </p>
      <h1 id="page-title" tabIndex={-1}>
        {loaderData.title}
      </h1>
      {loaderData.publicPath && (
        <p className="mt-1">
          <a href={loaderData.publicPath} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 font-semibold link">
            {t("admin.pages.viewPage")}
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        </p>
      )}
      {loaderData.isPlaceholder && !saved && (
        <Alert tone="warning" role="note" title={t("admin.pages.sampleTitle")} className="mt-4">
          <p>{t("admin.pages.sampleBody")}</p>
        </Alert>
      )}
      {refusal?.code === "PAGE_CHANGED" ? (
        <ChangedAlert message={refusal.message} href={`/admin/pages/${loaderData.key}`} alertRef={summary} onReload={() => (dirtyRef.current = false)} />
      ) : refusal ? (
        <ErrorSummary ref={summary} message={refusal.message} fields={refusal.fields} anchors={anchorsFor(loaderData.fields)} title={t("admin.pages.errorSummaryTitle")} />
      ) : null}
      <fetcher.Form
        method="post"
        noValidate
        onChange={markDirty}
        onInput={markDirty}
        onFocus={keepAboveSaveBar}
        onSubmit={(event) => {
          // A failed photo blocks the save until it is retried or removed (S-247 AC5).
          if (failed > 0) {
            event.preventDefault();
            setBlocked(true);
          }
        }}
        className="mt-6 grid gap-6"
      >
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="version" value={answer?.ok ? answer.version : loaderData.version} />
        {sessions.map((session) => (
          <input key={session} type="hidden" name="uploadSessionId" value={session} />
        ))}
        <TextSections loaderData={loaderData} errors={errors} />
        {loaderData.photoLimit > 0 && (
          <SettingsSection id="photos-section" title={t("admin.pages.photos.legend")}>
            <PagePhotos id="photos" legend={t("admin.pages.photos.listLabel")} hint={t("admin.pages.photos.hint", { max: loaderData.photoLimit })} max={loaderData.photoLimit} photos={photos} alts={pageAlts.alts} setAlt={pageAlts.setAlt} formName="photos" errors={errors} onChange={markDirty} announce={announce} />
          </SettingsSection>
        )}
        {loaderData.key === "workshops" && <NextWorkshop loaderData={loaderData} errors={errors} eventPhotos={eventPhotos} eventAlts={eventAlts} onChange={markDirty} announce={announce} />}
        <div data-editor-bar="" className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card px-4 py-3 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
          {blocked && failed > 0 && (
            <p role="alert" className="mb-2 font-semibold text-destructive">
              {t("admin.product.photos.blockedSave")}
            </p>
          )}
          <SubmitButton pending={fetcher.state !== "idle" || busy} pendingText={busy ? t("admin.pages.waitingPhoto") : t("admin.pages.saving")} pendingLabel={busy ? t("admin.pages.waitingPhoto") : t("admin.pages.saving")} className="h-auto min-h-11 w-full whitespace-normal md:w-auto">
            {t("admin.pages.save")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      {region}
      <LeaveDialog blocker={blocker} />
    </div>
  );
}
