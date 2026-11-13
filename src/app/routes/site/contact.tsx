import { Clock, ExternalLink, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { data } from "react-router";
import { SitePageError } from "~/components/site/page-error";
import { PlainText } from "~/components/site/plain-text";
import { Button } from "~/components/ui/button";
import { t as serverT } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { mailHref, safeWebUrl, telHref, whatsappHref } from "~/lib/contact";
import { type Locale, localeFromPathname } from "~/lib/locale";
import { SEO_HANDLE, SITE_NAME, canonicalUrl, rootOrigin, seoMeta } from "~/lib/seo";
import { requestDbContext } from "~/server/db.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { publicConfigContext } from "~/server/public-config.server";
import { getSitePage } from "~/server/services/site-page.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/contact";

/** The page text Owner or Admin edits (S-245 page key `contact`): intro, hours, pickup note. */
export interface ContactText {
  intro: string;
  hours: string;
  pickupNote: string;
}


/** The pickup area every page names; the seeded Settings address is just this, not an exact address. */
const PICKUP_AREA = "beau bassin";

/** The Owner's exact pickup address, or null while Settings holds only the area (AC6). */
function exactAddress(address: string | null): string | null {
  return address && address.trim().toLowerCase() !== PICKUP_AREA ? address : null;
}

/** Its meta uses seoMeta: the site layout leaves the brand share image to it. */
export const handle = SEO_HANDLE;

/**
 * `site/contact` loader (S-251, FR-079): contact details from Settings (Owner only, S-058; the
 * isolate cache, so a change shows within 60 s) and the page text. The email is the footer's
 * own Settings value (S-251 AC4 amended), so the page and the footer never disagree; no form.
 */
export async function loader({ url, context }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const { supabaseUrl } = context.get(publicConfigContext);
  const [settings, read] = await Promise.all([timed(context, "settings", () => getSiteSettings(db)), timed(context, "page", () => getSitePage(db, "contact", locale, supabaseUrl))]);
  // The page text is the client's (admin Pages, S-245/S-246); a failed read is the error state.
  if (!read.ok) throw data(null, { status: 503 });
  const text: ContactText = { intro: read.page.text.intro ?? "", hours: read.page.text.hours ?? "", pickupNote: read.page.text.pickup_note ?? "" };
  return {
    title: serverT("contactPage.title", locale),
    description: serverT("contactPage.metaDescription", locale),
    whatsapp: settings.footer.whatsapp,
    phone: settings.footer.phone,
    email: settings.footer.email,
    address: exactAddress(settings.footer.pickupAddress),
    mapUrl: safeWebUrl(settings.checkout.pickup.mapUrl),
    text,
    isPlaceholder: read.page.isPlaceholder,
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
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-3 min-[20rem]:p-4 min-[23rem]:p-5">
      <h2 id={id} className="flex items-center gap-2 text-2xl">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

const iconProps = { "aria-hidden": true, className: "size-5 shrink-0 text-primary-strong", strokeWidth: 1.75 } as const;

/**
 * Below 20rem (200% zoom on a 320 or 375 px phone) the buttons drop their icon and side padding
 * and may break inside a word, so "WhatsApp" and the number never push the page sideways.
 */
const NARROW_BUTTON = "w-full px-3 wrap-anywhere min-[20rem]:px-6";
const NARROW_ICON = "hidden min-[20rem]:block";

/** WhatsApp (primary), phone and email (outline), full width on phones; each omitted without its Settings value (AC2, AC4). */
function ReachCard({ whatsapp, phone, email }: { whatsapp: string | null; phone: string | null; email: string | null }) {
  const { t } = useI18n();
  return (
    <InfoCard id="contact-reach" title={t("contactPage.reachHeading")} icon={<MessageCircle {...iconProps} />}>
      <div className="flex flex-col gap-3">
        {whatsapp && (
          <Button asChild className={NARROW_BUTTON}>
            <a href={whatsappHref(whatsapp, t("contactPage.greeting"))}>
              <MessageCircle aria-hidden="true" strokeWidth={1.75} className={NARROW_ICON} />
              {t("sitePage.whatsapp")}
            </a>
          </Button>
        )}
        {phone && (
          <Button asChild variant="outline" className={NARROW_BUTTON}>
            <a href={telHref(phone)}>
              <Phone aria-hidden="true" strokeWidth={1.75} className={NARROW_ICON} />
              <span>{t("sitePage.call", { number: phone })}</span>
            </a>
          </Button>
        )}
        {email && (
          <Button asChild variant="outline" className={NARROW_BUTTON}>
            <a href={mailHref(email)}>
              <Mail aria-hidden="true" strokeWidth={1.75} className={NARROW_ICON} />
              {/* Long addresses may break anywhere at narrow widths (as in the footer). */}
              <span className="min-w-0 wrap-anywhere">{t("contactPage.email", { email })}</span>
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
  const { whatsapp, phone, email, address, mapUrl, text } = loaderData;
  return (
    <>
      <header className="text-center">
        <h1>{t("contactPage.title")}</h1>
        <span aria-hidden="true" className="mx-auto mt-3 block h-px w-16 bg-gold" />
        {text.intro && <PlainText text={text.intro} className="mx-auto mt-3 max-w-measure justify-items-center text-lg text-muted-foreground" />}
      </header>
      {/* One column on phones; two at md, the reach card first so WhatsApp is never below the fold. */}
      <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2 md:gap-6">
        {(whatsapp || phone || email) && <ReachCard whatsapp={whatsapp} phone={phone} email={email} />}
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
