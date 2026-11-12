import { Armchair, CalendarHeart, MessageCircle, PhoneCall } from "lucide-react";
import { data, Link } from "react-router";
import { PlainText } from "~/components/site/plain-text";
import { PagePhoto, SitePageError, SitePageView, brandPageMeta, useSiteContacts } from "~/components/site/site-page-view";
import { Button } from "~/components/ui/button";
import { isUpcoming } from "~/domain/site-pages";
import { formatLongDate, todayMU } from "~/domain/time";
import { t as serverT } from "~/i18n/catalog.server";
import { SEO_HANDLE } from "~/lib/seo";
import { useI18n } from "~/i18n/react";
import { telHref, whatsappHref } from "~/lib/contact";
import { localeFromPathname, localePath } from "~/lib/locale";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { timed } from "~/server/server-timing.server";
import { getSitePage } from "~/server/services/site-page.server";
import type { Route } from "./+types/workshops";

/**
 * `site/workshops` (`/workshops`, `/fr/workshops`; E-13 S-249, FR-078): what the occasional
 * event workshops are, the next one when the client has set it (until its date has passed,
 * Mauritius date), a calm empty state otherwise, and a WhatsApp call to action. No booking,
 * price or date picker (Owner decision: booking is a later epic).
 */
export async function loader({ context, url }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const read = await timed(context, "page", () => getSitePage(context.get(requestDbContext).db, "workshops", locale, context.get(publicConfigContext).supabaseUrl));
  const seo = { title: serverT("sitePages.workshops.title", locale), description: serverT("sitePages.workshops.metaDescription", locale) };
  if (!read.ok) return data({ ...seo, page: null, next: null, indexable: false }, { status: 503 });
  const { event, ...page } = read.page;
  const today = todayMU(context.get(clockContext).now());
  // Shown until its day has passed (Mauritius date); then the calm "none planned" state.
  const next = event && isUpcoming(event.title, event.date, today) ? { ...event, dateLabel: formatLongDate(event.date, locale) } : null;
  return { ...seo, page, next, indexable: !page.isPlaceholder };
}

/** Its meta uses seoMeta (S-253): the root Layout leaves the share image to it. */
export const handle = SEO_HANDLE;

export function meta(args: Route.MetaArgs) {
  return brandPageMeta(args, "/workshops");
}

type Next = NonNullable<Route.ComponentProps["loaderData"]["next"]>;

function NextWorkshop({ next }: { next: Next | null }) {
  const { t } = useI18n();
  if (!next) {
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
    <section aria-labelledby="next-workshop" className="grid gap-4 rounded-card border border-border bg-card p-2 min-[20rem]:p-4 sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("sitePages.workshops.nextTitle")}</p>
      <h2 id="next-workshop" className="-mt-2 text-2xl">
        {next.title}
      </h2>
      <ul className="grid gap-2">
        <li className="flex items-center gap-2">
          <CalendarHeart aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
          <time dateTime={next.date}>{next.dateLabel}</time>
        </li>
        {next.seats !== null && (
          <li className="flex items-center gap-2">
            <Armchair aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
            {t("sitePages.workshops.seats", { count: next.seats })}
          </li>
        )}
      </ul>
      {next.text && <PlainText text={next.text} />}
      {next.photo && <PagePhoto photo={next.photo} />}
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
  const { page, next } = loaderData;
  if (!page) return <SitePageError title={t("sitePages.workshops.title")} />;
  return (
    <SitePageView title={t("sitePages.workshops.title")} intro={page.text.intro} body={page.text.body} photos={page.photos}>
      <NextWorkshop next={next} />
      <p className="text-center">
        <AskAboutWorkshops />
      </p>
    </SitePageView>
  );
}
