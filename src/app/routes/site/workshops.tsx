import { MessageCircle, PhoneCall } from "lucide-react";
import { data, Link } from "react-router";
import { SitePageError, SitePageView, brandPageMeta, useSiteContacts } from "~/components/site/site-page-view";
import { Button } from "~/components/ui/button";
import { EventCard, type EventView } from "~/components/workshops/event-card";
import { formatLongDate, todayMU } from "~/domain/time";
import { timeRange } from "~/domain/workshop";
import { t as serverT } from "~/i18n/catalog.server";
import { SEO_HANDLE } from "~/lib/seo";
import { useI18n } from "~/i18n/react";
import { telHref, whatsappHref } from "~/lib/contact";
import { localeFromPathname, localePath } from "~/lib/locale";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { timed } from "~/server/server-timing.server";
import { listUpcomingEvents } from "~/server/repos/workshops.server";
import { getSitePage } from "~/server/services/site-page.server";
import type { Route } from "./+types/workshops";

/**
 * `site/workshops` (`/workshops`, `/fr/workshops`; E-13 S-249, E-15 S-302): the intro the client
 * edits in admin Pages, then the upcoming published workshop events (soonest first) with their
 * places left, or a calm empty state and the WhatsApp ask. A browsing page: server-rendered,
 * deferred hydration, no JavaScript of its own (NFR-001).
 */
export async function loader({ context, url }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const { supabaseUrl } = context.get(publicConfigContext);
  const today = todayMU(context.get(clockContext).now());
  const [read, events] = await Promise.all([
    timed(context, "page", () => getSitePage(db, "workshops", locale, supabaseUrl)),
    timed(context, "events", () => listUpcomingEvents(db, today, locale, supabaseUrl)),
  ]);
  const seo = { title: serverT("sitePages.workshops.title", locale), description: serverT("sitePages.workshops.metaDescription", locale) };
  if (!read.ok) return data({ ...seo, page: null, events: [] as EventView[], indexable: false }, { status: 503 });
  const { event: _legacyNext, ...page } = read.page;
  const views: EventView[] = events.map(({ options: _options, status: _status, id: _id, ...e }) => ({
    ...e,
    dateLabel: formatLongDate(e.eventOn, locale),
    timeLabel: timeRange(e.startsAt, e.endsAt, locale),
  }));
  // Indexable once the intro was edited or a workshop is listed (FR-081).
  return { ...seo, page, events: views, indexable: !page.isPlaceholder || views.length > 0 };
}

/** Its meta uses seoMeta (S-253): the site layout leaves the share image to it. */
export const handle = SEO_HANDLE;

export function meta(args: Route.MetaArgs) {
  return brandPageMeta(args, "/workshops");
}

function UpcomingWorkshops({ events }: { events: EventView[] }) {
  const { t } = useI18n();
  if (events.length === 0) {
    return (
      <section aria-labelledby="next-workshop" className="rounded-card border border-border bg-card p-2 text-center min-[20rem]:p-4 sm:p-6">
        <h2 id="next-workshop" className="text-2xl">
          {t("sitePages.workshops.noneTitle")}
        </h2>
        <p className="mx-auto mt-2 max-w-measure">{t("sitePages.workshops.noneBody")}</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="upcoming-workshops" className="grid gap-4">
      <h2 id="upcoming-workshops" className="border-b border-gold pb-2 text-2xl">
        {t("workshops.upcomingTitle")}
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {events.map((event, i) => (
          <EventCard key={event.slug} event={event} index={i} />
        ))}
      </ul>
    </section>
  );
}

/** WhatsApp with a pre-filled message; else the phone; else Contact us (S-249 AC3, AC5). */
function AskAboutWorkshops() {
  const { t, locale } = useI18n();
  const contacts = useSiteContacts();
  if (contacts?.whatsapp) {
    return (
      <Button asChild size="lg" className="h-auto min-h-12 max-w-full whitespace-normal wrap-anywhere px-4 sm:px-7">
        <a href={whatsappHref(contacts.whatsapp, t("sitePages.workshops.whatsappMessage"))} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden="true" strokeWidth={1.75} />
          {t("sitePages.workshops.ask")}
          <span className="sr-only"> {t("sitePages.opensWhatsapp")}</span>
        </a>
      </Button>
    );
  }
  if (contacts?.phone) {
    return (
      <Button asChild size="lg" variant="secondary" className="h-auto min-h-12 max-w-full whitespace-normal wrap-anywhere px-4 sm:px-7">
        <a href={telHref(contacts.phone)}>
          <PhoneCall aria-hidden="true" strokeWidth={1.75} />
          {t("sitePages.workshops.call", { phone: contacts.phone })}
        </a>
      </Button>
    );
  }
  return (
    <Link to={localePath(locale, "/contact")} className="inline-flex min-h-11 items-center font-semibold link">
      {t("sitePages.workshops.contactLink")}
    </Link>
  );
}

export default function Workshops({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { page, events } = loaderData;
  if (!page) return <SitePageError title={t("sitePages.workshops.title")} />;
  return (
    <SitePageView title={t("sitePages.workshops.title")} intro={page.text.intro} body={page.text.body} photos={page.photos}>
      <UpcomingWorkshops events={events} />
      <p className="text-center">
        <AskAboutWorkshops />
      </p>
    </SitePageView>
  );
}
