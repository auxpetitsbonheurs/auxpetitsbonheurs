import { MessageCircle, Phone } from "lucide-react";
import { Link, data, redirect } from "react-router";
import { type RequestFormData, type RequestRefusal, RequestForm } from "~/components/custom-request/request-form";
import { SitePageError } from "~/components/site/page-error";
import { PlainText } from "~/components/site/plain-text";
import { PagePhotoGrid } from "~/components/site/site-page-view";
import { Button } from "~/components/ui/button";
import { REQUEST_ECHOED_FIELDS, requestFormRecord } from "~/server/contracts/custom-request";
import { addDays, todayMU } from "~/domain/time";
import { DAY_HORIZON } from "~/domain/availability";
import { t as serverT } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { telHref, whatsappHref } from "~/lib/contact";
import { type Locale, localeFromPathname, localePath } from "~/lib/locale";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import { actionError } from "~/server/action-result.server";
import { clientIp } from "~/server/auth-rate-limit.server";
import { clockContext } from "~/server/clock.server";
import { Uuid } from "~/server/contracts/shared";
import { requestDbContext } from "~/server/db.server";
import { findGalleryAttachment } from "~/server/repos/custom-requests.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { publicConfigContext } from "~/server/public-config.server";
import { noStore } from "~/server/response-headers.server";
import { deferOrderAlert } from "~/server/notify/admin-alerts.server";
import { type SubmitRequestResult, submitCustomRequest } from "~/server/services/custom-request.server";
import { getSitePage } from "~/server/services/site-page.server";
import { timed } from "~/server/server-timing.server";
import { requestPhotosContext } from "~/server/storage.server";
import { turnstileContext } from "~/server/turnstile.server";
import type { Route } from "./+types/custom-order";

/** The page text Owner or Admin edits (S-245 page key `custom_order`): intro and body. */
export interface CustomOrderText {
  intro: string;
  body: string;
}

/** Its meta uses seoMeta: the site layout leaves the brand share image to it. */
export const handle = SEO_HANDLE;

/** The request form carries a per-render idempotency key and upload session (S-151 AC5): never cached. */
export const middleware: Route.MiddlewareFunction[] = [noStore];

/**
 * `site/custom-cake` loader (S-252 page, E-08 S-151 form; contracts.md v0.43): the explanation,
 * the notice from Settings and the contacts, then the request form's data: the public date rules
 * (the picker computes the 90 days like checkout), windows, pickup and fee, policies, a fresh
 * idempotency key and upload session, the gallery photo of `?fromGallery=` when it exists
 * (S-154; anything else is ignored) and the Turnstile site key (null: no widget).
 */
export async function loader({ url, context }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const { supabaseUrl } = context.get(publicConfigContext);
  const fromGallery = Uuid.safeParse(url.searchParams.get("fromGallery"));
  const [settings, read, gallery] = await Promise.all([
    timed(context, "settings", () => getSiteSettings(db)),
    timed(context, "page", () => getSitePage(db, "custom_order", locale, supabaseUrl)),
    fromGallery.success ? timed(context, "gallery", () => findGalleryAttachment(db, fromGallery.data, supabaseUrl)) : Promise.resolve(null),
  ]);
  // The page text and up to 3 photos are the client's (admin Pages, S-245..S-247); a failed read is the error state.
  if (!read.ok) throw data(null, { status: 503 });
  return {
    title: serverT("customOrderPage.title", locale),
    description: serverT("customOrderPage.metaDescription", locale),
    whatsapp: settings.footer.whatsapp,
    phone: settings.footer.phone,
    noticeDays: settings.noticeDays,
    text: { intro: read.page.text.intro ?? "", body: read.page.text.body ?? "" } satisfies CustomOrderText,
    photos: read.page.photos,
    isPlaceholder: read.page.isPlaceholder,
    form: requestFormData(settings, locale, context, gallery),
  };
}

function requestFormData(settings: Awaited<ReturnType<typeof getSiteSettings>>, locale: Locale, context: Route.LoaderArgs["context"], gallery: RequestFormData["attachedGalleryPhoto"]): RequestFormData {
  const today = todayMU(context.get(clockContext).now());
  // Only the blocks the picker can meet, as ranges (FR-014: never the private reason).
  const horizon = addDays(today, DAY_HORIZON);
  const blocked = settings.availability.blocked.filter((b) => b.endsOn >= today && b.startsOn < horizon);
  const { checkout } = settings;
  return {
    idempotencyKey: crypto.randomUUID(),
    uploadSessionId: crypto.randomUUID(),
    today,
    availability: { ...settings.availability, blocked },
    windows: checkout.windows,
    pickup: checkout.pickup,
    policies: checkout.policies ? localized(checkout.policies, locale) : serverT("checkout.policiesDefault", locale),
    whatsapp: settings.footer.whatsapp,
    attachedGalleryPhoto: gallery,
    turnstileSiteKey: context.get(turnstileContext).siteKey,
  };
}

/** Posted values sent back so a refused form keeps what was typed (S-162 AC4). */
function echo(form: Record<string, unknown>): Record<string, string> {
  const values = Object.fromEntries(REQUEST_ECHOED_FIELDS.flatMap((key) => (typeof form[key] === "string" ? [[key, form[key] as string]] : [])));
  const key = Uuid.safeParse(form.idempotencyKey);
  return key.success ? { ...values, idempotencyKey: key.data } : values;
}

const messageKey = (field: string) => `customRequest.errors.${field.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase())}`;

function refusal(result: Exclude<SubmitRequestResult, { ok: true }>, values: Record<string, string>, locale: Locale) {
  switch (result.code) {
    case "VALIDATION_FAILED": {
      if ("keyReused" in result) return actionError(result.code, locale, { fields: { form: serverT("customRequest.keyReused", locale) }, extra: { values: { ...values, idempotencyKey: crypto.randomUUID() } } });
      const fields = Object.fromEntries(result.fields.map((f) => [f, serverT(messageKey(f), locale)]));
      return actionError(result.code, locale, { fields, extra: result.windows ? { values, windows: result.windows } : { values } });
    }
    case "DATE_UNAVAILABLE":
      return actionError(result.code, locale, { fields: { date: serverT(`checkout.errors.dateUnavailable.${result.reason}`, locale) }, extra: { values, reason: result.reason, availability: result.availability } });
    case "UPLOAD_REJECTED":
      return actionError(result.code, locale, { fields: { photos: serverT("customRequest.photosRejected", locale) }, extra: { values } });
    case "RATE_LIMITED": {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      return actionError(result.code, locale, { fields: { form: serverT("customRequest.rateLimited", locale, { minutes }) }, extra: { values }, headers: { "Retry-After": String(result.retryAfterSeconds) } });
    }
    case "BOT_CHECK_FAILED":
      return actionError(result.code, locale, { extra: { values } });
    case "INTERNAL":
      return actionError(result.code, locale, { extra: { values } });
  }
}

/** `submitCustomRequest` (S-151, S-153, S-162): redirect to the confirmation, or the refusal with the form kept. */
export async function action({ request, url, context }: Route.ActionArgs) {
  const locale = localeFromPathname(url.pathname);
  const form = requestFormRecord(await request.formData());
  if (form.intent !== "submitCustomRequest") return actionError("VALIDATION_FAILED", locale);
  const result = await timed(context, "custom-request", () =>
    submitCustomRequest(form, {
      db: context.get(requestDbContext).db,
      now: context.get(clockContext).now(),
      locale,
      ip: clientIp(request),
      turnstile: context.get(turnstileContext),
      photos: context.get(requestPhotosContext),
    }),
  );
  if (!result.ok) return refusal(result, echo(form), locale);
  // Admin push after the response (S-195 AC2); the email rows were queued with the request.
  if (!result.replayed) deferOrderAlert(context, "new_request", { orderId: result.orderId });
  // The request's own language: a replay from the other language returns the original redirect.
  return redirect(localePath(result.locale, `/order/${result.trackingToken}/confirmed`));
}

export function meta({ loaderData, matches, location }: Route.MetaArgs) {
  if (!loaderData) return [];
  const locale = localeFromPathname(location.pathname);
  return seoMeta({
    origin: rootOrigin(matches),
    locale,
    path: "/custom-cake",
    title: loaderData.title,
    description: loaderData.description,
    image: loaderData.photos[0]?.url ?? null,
    noindex: loaderData.isPlaceholder,
  });
}

/**
 * The other way to ask (S-252 AC2, AC3 once the form exists): WhatsApp with a pre-filled
 * message; without a WhatsApp number the phone; without either, the Contact page.
 */
function CallToAction({ whatsapp, phone }: { whatsapp: string | null; phone: string | null }) {
  const { t, locale } = useI18n();
  if (whatsapp) {
    return (
      <Button asChild size="lg" variant="outline" className="w-full whitespace-normal sm:w-auto">
        <a href={whatsappHref(whatsapp, t("customOrderPage.greeting"))}>
          <MessageCircle aria-hidden="true" strokeWidth={1.75} />
          {t("customOrderPage.cta")}
        </a>
      </Button>
    );
  }
  if (phone) {
    return (
      <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
        <a href={telHref(phone)}>
          <Phone aria-hidden="true" strokeWidth={1.75} />
          <span>{t("sitePage.call", { number: phone })}</span>
        </a>
      </Button>
    );
  }
  return (
    <Link to={localePath(locale, "/contact")} className="inline-flex min-h-11 items-center font-semibold link">
      {t("customOrderPage.contactLink")}
    </Link>
  );
}

const STEPS = ["share", "reply", "bake"] as const;

export default function CustomOrder({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { whatsapp, phone, noticeDays, text, photos, form } = loaderData;
  const refused = actionData && !actionData.ok ? (actionData as unknown as RequestRefusal) : undefined;
  return (
    <article className="mx-auto flex max-w-measure flex-col gap-8">
      <header className="text-center">
        <h1>{t("customOrderPage.title")}</h1>
        <span aria-hidden="true" className="mx-auto mt-3 block h-px w-16 bg-gold" />
        {text.intro && <PlainText text={text.intro} className="mt-3 justify-items-center text-lg text-muted-foreground" />}
        <p className="mt-6">
          <a href="#request-form-heading" className="inline-flex min-h-11 items-center font-semibold link">
            {t("customRequest.formTitle")}
          </a>
        </p>
      </header>
      {text.body && (
        <section aria-labelledby="custom-what" className="flex flex-col gap-3">
          <h2 id="custom-what" className="border-b border-gold pb-2 text-2xl">{t("customOrderPage.whatHeading")}</h2>
          <PlainText text={text.body} />
        </section>
      )}
      {/* Up to 3 photos from admin Pages (S-252 AC1, S-247); none leaves no empty area. */}
      <PagePhotoGrid photos={photos} />
      <section aria-labelledby="custom-how" className="flex flex-col gap-3">
        <h2 id="custom-how" className="border-b border-gold pb-2 text-2xl">{t("customOrderPage.howHeading")}</h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gold font-semibold text-primary-strong">
                {i + 1}
              </span>
              <span className="pt-1">{t(`customOrderPage.steps.${step}`)}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="custom-notice" className="flex flex-col gap-3">
        <h2 id="custom-notice" className="border-b border-gold pb-2 text-2xl">{t("customOrderPage.noticeHeading")}</h2>
        <p>{noticeDays > 0 ? t("customOrderPage.notice", { count: noticeDays }) : t("customOrderPage.noticeSoon")}</p>
      </section>
      {/* The request form (E-08 S-151); WhatsApp stays as the second way to ask (S-252 AC3). */}
      <section aria-labelledby="request-form-heading" className="border-t border-gold pt-6">
        <h2 id="request-form-heading" tabIndex={-1} className="text-2xl outline-offset-4">
          {t("customRequest.formTitle")}
        </h2>
        <p className="mt-2">{t("customRequest.formIntro")}</p>
        <RequestForm data={form} refusal={refused} />
      </section>
      <div className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
        <p>{t("customRequest.orWhatsapp")}</p>
        <CallToAction whatsapp={whatsapp} phone={phone} />
      </div>
    </article>
  );
}

export function ErrorBoundary() {
  const { t } = useI18n();
  return <SitePageError title={t("customOrderPage.title")} />;
}
