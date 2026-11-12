import { Clock, ExternalLink, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { SitePageError } from "~/components/site/page-error";
import { PlainText } from "~/components/site/plain-text";
import { Button } from "~/components/ui/button";
import { t as serverT } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { safeWebUrl, telHref, whatsappHref } from "~/lib/contact";
import { type Locale, localeFromPathname } from "~/lib/locale";
import { SEO_HANDLE, SITE_NAME, canonicalUrl, rootOrigin, seoMeta } from "~/lib/seo";
import { requestDbContext } from "~/server/db.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { contentPagePlaceholders } from "~/server/seo-pages.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/contact";

/** The page text Owner or Admin edits (S-245 page key `contact`): intro, hours, pickup note. */
export interface ContactText {
  intro: string;
  hours: string;
  pickupNote: string;
}

/**
 * Interim text until the `site_page` read exists (S-245): the copywriter's neutral placeholder
 * from the catalogue (EN fallback per field). S-245 swaps this for the stored page.
 */
function placeholderText(locale: Locale): ContactText {
  return {
    intro: serverT("contactPage.intro", locale),
    hours: serverT("contactPage.hours", locale),
    pickupNote: serverT("contactPage.pickupNote", locale),
  };
}

/** The pickup area every page names; the seeded Settings address is just this, not an exact address. */
const PICKUP_AREA = "beau bassin";

/** The Owner's exact pickup address, or null while Settings holds only the area (AC6). */
function exactAddress(address: string | null): string | null {
  return address && address.trim().toLowerCase() !== PICKUP_AREA ? address : null;
}

/** Its meta uses seoMeta: the root Layout leaves the brand share image to it. */
export const handle = SEO_HANDLE;

/**
 * `site/contact` loader (S-251, FR-079): contact details from Settings (Owner only, S-058; the
 * isolate cache, so a change shows within 60 s) and the page text. No email address is read
 * into the page: there is no form and no email until a custom domain exists.
 */
export async function loader({ url, context }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const [settings, placeholders] = await Promise.all([timed(context, "settings", () => getSiteSettings(db)), contentPagePlaceholders(db)]);
  return {
    title: serverT("contactPage.title", locale),
    description: serverT("contactPage.metaDescription", locale),
    whatsapp: settings.footer.whatsapp,
    phone: settings.footer.phone,
    address: exactAddress(settings.footer.pickupAddress),
    mapUrl: safeWebUrl(settings.checkout.pickup.mapUrl),
    text: placeholderText(locale),
    isPlaceholder: placeholders.contact,
  };
}

type ContactData = Awaited<ReturnType<typeof loader>>;

/**
 * LocalBusiness data (S-251 AC9, S-253 AC7) only when the page text is real and the Owner has
 * entered the address: placeholder facts must never reach search results. No rating here (E-14).
 */
export function bakeryJsonLd(data: ContactData, origin: string | null, locale: Locale) {
  if (data.isPlaceholder || !data.address || !origin) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Bakery",
    name: SITE_NAME,
    url: `${origin}${locale === "fr" ? "/fr/" : "/"}`,
    ...(data.phone ? { telephone: data.phone } : {}),
    address: { "@type": "PostalAddress", streetAddress: data.address, addressLocality: "Beau Bassin", addressCountry: "MU" },
    ...(data.mapUrl ? { hasMap: data.mapUrl } : {}),
    mainEntityOfPage: canonicalUrl(origin, locale, "/contact"),
  };
}

export function meta({ loaderData, matches, location }: Route.MetaArgs) {
  if (!loaderData) return [];
  const origin = rootOrigin(matches);
  const locale = localeFromPathname(location.pathname);
  const tags = seoMeta({ origin, locale, path: "/contact", title: loaderData.title, description: loaderData.description, noindex: loaderData.isPlaceholder });
  const ld = bakeryJsonLd(loaderData, origin, locale);
  return ld ? [...tags, { "script:ld+json": ld }] : tags;
}

function InfoCard({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 min-[23rem]:p-5">
      <h2 id={id} className="flex items-center gap-2 text-2xl">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

const iconProps = { "aria-hidden": true, className: "size-5 shrink-0 text-primary-strong", strokeWidth: 1.75 } as const;

/** WhatsApp (primary) and phone (outline), full width on phones; each omitted without its Settings value (AC2). */
function ReachCard({ whatsapp, phone }: { whatsapp: string | null; phone: string | null }) {
  const { t } = useI18n();
  return (
    <InfoCard id="contact-reach" title={t("contactPage.reachHeading")} icon={<MessageCircle {...iconProps} />}>
      <div className="flex flex-col gap-3">
        {whatsapp && (
          <Button asChild className="w-full">
            <a href={whatsappHref(whatsapp, t("contactPage.greeting"))}>
              <MessageCircle aria-hidden="true" strokeWidth={1.75} />
              {t("sitePage.whatsapp")}
            </a>
          </Button>
        )}
        {phone && (
          <Button asChild variant="outline" className="w-full">
            <a href={telHref(phone)}>
              <Phone aria-hidden="true" strokeWidth={1.75} />
              <span>{t("sitePage.call", { number: phone })}</span>
            </a>
          </Button>
        )}
      </div>
    </InfoCard>
  );
}

function PickupCard({ address, note, mapUrl }: { address: string | null; note: string; mapUrl: string | null }) {
  const { t } = useI18n();
  return (
    <InfoCard id="contact-pickup" title={t("contactPage.pickupHeading")} icon={<MapPin {...iconProps} />}>
      <p className="font-semibold">{t("contactPage.pickupArea")}</p>
      {address && <PlainText text={address} />}
      {note && <PlainText text={note} className="text-muted-foreground" />}
      {mapUrl && (
        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start font-semibold link">
          {t("contactPage.mapLink")}
          <span className="sr-only"> {t("sitePage.newTab")}</span>
          <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </a>
      )}
    </InfoCard>
  );
}

export default function Contact({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { whatsapp, phone, address, mapUrl, text } = loaderData;
  return (
    <>
      <header className="text-center">
        <h1>{t("contactPage.title")}</h1>
        <span aria-hidden="true" className="mx-auto mt-3 block h-px w-16 bg-gold" />
        {text.intro && <PlainText text={text.intro} className="mx-auto mt-3 max-w-measure justify-items-center text-lg text-muted-foreground" />}
      </header>
      {/* One column on phones; two at md, the reach card first so WhatsApp is never below the fold. */}
      <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2 md:gap-6">
        {(whatsapp || phone) && <ReachCard whatsapp={whatsapp} phone={phone} />}
        <PickupCard address={address} note={text.pickupNote} mapUrl={mapUrl} />
        {text.hours && (
          <InfoCard id="contact-hours" title={t("contactPage.hoursHeading")} icon={<Clock {...iconProps} />}>
            <PlainText text={text.hours} />
          </InfoCard>
        )}
      </div>
    </>
  );
}

export function ErrorBoundary() {
  const { t } = useI18n();
  return <SitePageError title={t("contactPage.title")} />;
}
