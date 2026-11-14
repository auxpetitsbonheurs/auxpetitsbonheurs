import { ChevronLeft, MapPinned, MessageCircle } from "lucide-react";
import { Link, data, redirect } from "react-router";
import { PlainText } from "~/components/site/plain-text";
import { useSiteContacts } from "~/components/site/site-page-view";
import { Button } from "~/components/ui/button";
import { type EventView, EventFacts, EventPhoto } from "~/components/workshops/event-card";
import { type RegistrationFormData, type RegistrationRefusal, RegistrationForm } from "~/components/workshops/registration-form";
import { formatLongDate, todayMU } from "~/domain/time";
import { isOpen, maxCakes, timeRange } from "~/domain/workshop";
import { namespaceMessages, t as serverT } from "~/i18n/catalog.server";
import { ExtraMessages, useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";
import { type Locale, formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import { actionError } from "~/server/action-result.server";
import { clientIp } from "~/server/auth-rate-limit.server";
import { clockContext } from "~/server/clock.server";
import { REGISTRATION_ECHOED_FIELDS, flatForm } from "~/server/contracts/workshops";
import { customerSession, hasSignedInHint } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { alertAdmins } from "~/server/notify/admin-alerts.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findPublicEvent } from "~/server/repos/workshops.server";
import { noStore } from "~/server/response-headers.server";
import { timed } from "~/server/server-timing.server";
import { type RegisterResult, registerWorkshop } from "~/server/services/register-workshop.server";
import { turnstileContext } from "~/server/turnstile.server";
import type { Route } from "./+types/workshop";

/** Its meta uses seoMeta: the site layout leaves the share image to it. */
export const handle = SEO_HANDLE;

/** The form carries a per-render idempotency key: never cached. */
export const middleware: Route.MiddlewareFunction[] = [noStore];

type PageState = "open" | "full" | "cancelled" | "past";

/** The signed-in customer (E-11), read only when the browser says it has a customer session. */
async function signedInCustomer(args: Route.LoaderArgs | Route.ActionArgs) {
  if (!hasSignedInHint(args.request)) return null;
  const session = await customerSession(args).catch(() => null);
  return session?.status === "customer" ? session.customer : null;
}

/**
 * `site/workshop` loader (`/workshops/:slug`, E-15 S-303): the event (any status but draft: 404),
 * whether registration is open, full, cancelled or past, and the form's data while open.
 */
export async function loader(args: Route.LoaderArgs) {
  const { context, url, params } = args;
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const today = todayMU(context.get(clockContext).now());
  const event = await timed(context, "event", () => findPublicEvent(db, params.slug, locale, context.get(publicConfigContext).supabaseUrl));
  if (!event) throw data(null, { status: 404 });
  const state: PageState = event.status === "cancelled" ? "cancelled" : !isOpen(event, today) ? "past" : event.placesLeft === 0 ? "full" : "open";
  const customer = state === "open" ? await signedInCustomer(args) : null;
  const view: EventView = { ...event, dateLabel: formatLongDate(event.eventOn, locale), timeLabel: timeRange(event.startsAt, event.endsAt, locale) };
  const form: RegistrationFormData | null =
    state === "open"
      ? {
          eventId: event.id,
          idempotencyKey: crypto.randomUUID(),
          priceRs: event.priceRs,
          maxCakes: maxCakes(event.placesLeft),
          placesLeft: event.placesLeft,
          options: event.options,
          turnstileSiteKey: context.get(turnstileContext).siteKey,
          prefill: customer ? { "contact.name": customer.name, "contact.phone": customer.phone, "contact.email": customer.authEmail } : null,
        }
      : null;
  return {
    messages: namespaceMessages(locale, "workshopForm"),
    event: view,
    state,
    form,
    description: serverT("workshops.metaDescription", locale, { title: event.title, date: view.dateLabel, price: formatRupees(event.priceRs) }),
  };
}

/** Posted values sent back so a refused form keeps what was typed (cake choices included). */
function echo(form: Record<string, unknown>): Record<string, string> {
  const keys = [...REGISTRATION_ECHOED_FIELDS, ...Object.keys(form).filter((k) => /^cake\.\d$/.test(k)), "idempotencyKey"];
  return Object.fromEntries(keys.flatMap((key) => (typeof form[key] === "string" ? [[key, form[key] as string]] : [])));
}

const messageKey = (field: string) => (field.startsWith("cake.") ? "workshopForm.errors.cake" : `workshopForm.errors.${field.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase())}`);

function refusal(result: Exclude<RegisterResult, { ok: true }>, values: Record<string, string>, locale: Locale) {
  switch (result.code) {
    case "VALIDATION_FAILED": {
      if (result.keyReused) return actionError(result.code, locale, { fields: { form: serverT("workshopForm.keyReused", locale) }, extra: { values: { ...values, idempotencyKey: crypto.randomUUID() } } });
      const fields = Object.fromEntries(result.fields.map((f) => [f, serverT(messageKey(f), locale)]));
      return actionError(result.code, locale, { fields, extra: { values } });
    }
    case "WORKSHOP_FULL": {
      const text = result.placesLeft > 0 ? serverT("workshopForm.full", locale, { count: result.placesLeft }) : serverT("workshopForm.fullNone", locale);
      return actionError(result.code, locale, { fields: { cakes: text }, extra: { values } });
    }
    case "WORKSHOP_CLOSED":
      return actionError(result.code, locale, { fields: { form: serverT("workshopForm.closed", locale) }, extra: { values } });
    case "RATE_LIMITED": {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      return actionError(result.code, locale, { fields: { form: serverT("workshopForm.rateLimited", locale, { minutes }) }, extra: { values }, headers: { "Retry-After": String(result.retryAfterSeconds) } });
    }
    case "BOT_CHECK_FAILED":
      return actionError(result.code, locale, { extra: { values } });
  }
}

/** `register` (S-303): redirect to the confirmation, or the refusal with the form kept. */
export async function action(args: Route.ActionArgs) {
  const { request, url, context } = args;
  const locale = localeFromPathname(url.pathname);
  const form = flatForm(await request.formData());
  if (form.intent !== "register") return actionError("VALIDATION_FAILED", locale);
  const account = await signedInCustomer(args);
  const result = await timed(context, "register", () =>
    registerWorkshop(form, {
      db: context.get(requestDbContext).db,
      now: context.get(clockContext).now(),
      locale,
      ip: clientIp(request),
      turnstile: context.get(turnstileContext),
      accountCustomerId: account?.id ?? null,
    }),
  );
  if (!result.ok) return refusal(result, echo(form), locale);
  // Admin push after the response (S-307); the admin email rows were queued with the registration.
  if (!result.replayed) await alertAdmins(context, "new_workshop", { orderId: result.orderId });
  return redirect(localePath(result.locale, `/order/${result.trackingToken}/confirmed`));
}

export function meta({ loaderData, matches, location, params }: Route.MetaArgs) {
  if (!loaderData) return [];
  return seoMeta({
    origin: rootOrigin(matches),
    locale: localeFromPathname(location.pathname),
    path: `/workshops/${params.slug}`,
    title: loaderData.event.title,
    description: loaderData.description,
    image: loaderData.event.photo?.url ?? null,
    noindex: loaderData.state !== "open" && loaderData.state !== "full",
  });
}

function Closed({ state, title }: { state: Exclude<PageState, "open">; title: string }) {
  const { t, locale } = useI18n();
  const contacts = useSiteContacts();
  const heading = state === "full" ? t("workshops.fullTitle") : state === "cancelled" ? t("workshops.cancelledTitle") : t("workshops.pastTitle");
  return (
    <section aria-labelledby="register-heading" className="grid gap-3 rounded-card border border-border bg-card p-4 text-center sm:p-6">
      <h2 id="register-heading" className="text-2xl">
        {heading}
      </h2>
      <p>{state === "full" ? t("workshops.fullBody") : t("workshops.closedBody")}</p>
      <p className="flex flex-wrap justify-center gap-3">
        {contacts?.whatsapp && (
          <Button asChild size="lg" className="h-auto min-h-12 max-w-full whitespace-normal">
            <a href={whatsappHref(contacts.whatsapp, t("workshops.whatsappFull", { title }))} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" strokeWidth={1.75} />
              {t("sitePages.workshops.ask")}
              <span className="sr-only"> {t("sitePages.opensWhatsapp")}</span>
            </a>
          </Button>
        )}
        <Link to={localePath(locale, "/workshops")} className="inline-flex min-h-11 items-center font-semibold link">
          {t("workshops.back")}
        </Link>
      </p>
    </section>
  );
}

export default function Workshop({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const { event, state, form, messages } = loaderData;
  const refused = actionData && !actionData.ok ? (actionData as unknown as RegistrationRefusal) : undefined;
  return (
    <ExtraMessages messages={messages}>
      <article className="mx-auto flex max-w-measure flex-col gap-6">
        <Link to={localePath(locale, "/workshops")} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold link">
          <ChevronLeft aria-hidden="true" className="size-5" />
          {t("workshops.back")}
        </Link>
        <header className="grid gap-4">
          <h1>{event.title}</h1>
          {event.photo && <EventPhoto photo={event.photo} sizes="(min-width: 48rem) 42rem, 100vw" eager />}
          <EventFacts event={event} />
          {event.mapUrl && (
            <a href={event.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start font-semibold link">
              <MapPinned aria-hidden="true" className="size-5" strokeWidth={1.75} />
              {t("workshops.map")}
            </a>
          )}
        </header>
        {event.description && <PlainText text={event.description} />}
        {state === "open" && form ? (
          <section aria-labelledby="register-heading" className="border-t border-gold pt-6">
            <h2 id="register-heading" tabIndex={-1} className="text-2xl outline-offset-4">
              {t("workshops.registerTitle")}
            </h2>
            <RegistrationForm data={form} refusal={refused} />
          </section>
        ) : (
          <Closed state={state as Exclude<PageState, "open">} title={event.title} />
        )}
      </article>
    </ExtraMessages>
  );
}
