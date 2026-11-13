import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { useI18n } from "~/i18n/react";
import { mailHref, telHref, whatsappHref } from "~/lib/contact";
import { localePath } from "~/lib/locale";
import { SITE_NAV_ITEMS } from "~/lib/site-nav";

export interface FooterContacts {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  pickupAddress: string | null;
  /** http(s) only (settings repo); null hides the link. */
  instagramUrl: string | null;
  /** The pickup address's map link, http(s) only. */
  mapUrl: string | null;
}

interface ContactLinkProps {
  href: string;
  icon: ReactNode;
  label: string;
  value?: string;
  /** Phone numbers stay on one line; emails may break anywhere at narrow widths. */
  keepTogether?: boolean;
  /** Off-site pages (Instagram, map) open in a new tab, announced to screen readers. */
  external?: boolean;
}

const linkClass = "inline-flex min-h-11 max-w-full items-center gap-2 rounded-md px-2 py-2 link wrap-anywhere";

function ContactLink({ href, icon, label, value, keepTogether = false, external = false }: ContactLinkProps) {
  const { t } = useI18n();
  return (
    <li>
      <a href={href} className={linkClass} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {icon}
        <span>
          {label}
          {value && (
            <>
              {" "}
              <span className={keepTogether ? "min-[20rem]:whitespace-nowrap" : undefined}>{value}</span>
            </>
          )}
          {external && <span className="sr-only"> {t("sitePage.newTab")}</span>}
        </span>
      </a>
    </li>
  );
}

const iconProps = { "aria-hidden": true, className: "size-5 shrink-0", strokeWidth: 1.75 } as const;

/** Instagram glyph (lucide ships no brand marks): a rounded square, the lens and the flash dot. */
function InstagramIcon() {
  return (
    <svg {...iconProps} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

/** The bakery's contacts and pickup place, each item only when Settings has a value (S-061 AC3). */
function FooterContactList({ contacts }: { contacts: FooterContacts }) {
  const { t } = useI18n();
  const { whatsapp, phone, email, instagramUrl } = contacts;
  if (!whatsapp && !phone && !email && !instagramUrl) return null;
  return (
    <section aria-labelledby="footer-contact" className="flex flex-col items-center md:items-start">
      <h2 id="footer-contact" className="text-xl">
        {t("shell.footer.heading")}
      </h2>
      <ul className="mt-2 flex flex-col items-center gap-1 md:-ms-2 md:items-start">
        {whatsapp && <ContactLink href={whatsappHref(whatsapp)} icon={<MessageCircle {...iconProps} />} label={t("shell.footer.whatsapp")} value={whatsapp} keepTogether />}
        {phone && <ContactLink href={telHref(phone)} icon={<Phone {...iconProps} />} label={t("shell.footer.phone")} value={phone} keepTogether />}
        {email && <ContactLink href={mailHref(email)} icon={<Mail {...iconProps} />} label={t("shell.footer.email")} value={email} />}
        {instagramUrl && <ContactLink href={instagramUrl} icon={<InstagramIcon />} label={t("shell.footer.instagram")} external />}
      </ul>
    </section>
  );
}

function FooterPickup({ address, mapUrl }: { address: string; mapUrl: string | null }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="footer-pickup" className="flex flex-col items-center md:items-start">
      <h2 id="footer-pickup" className="text-xl">
        {t("shell.footer.pickupHeading")}
      </h2>
      <p className="mt-3 flex max-w-xs items-start gap-2 wrap-anywhere">
        <MapPin {...iconProps} className="mt-0.5 size-5 shrink-0" />
        <span>{t("shell.footer.pickup", { address })}</span>
      </p>
      {mapUrl && (
        <ul className="mt-1 md:-ms-2">
          <ContactLink href={mapUrl} icon={null} label={t("shell.footer.map")} external />
        </ul>
      )}
    </section>
  );
}

/**
 * The site's pages (FR-076 order, Home left out: the logo above links it), then Reviews once one
 * is approved (E-14 S-267 AC5: footer only, the 7-item navigation is unchanged).
 */
function FooterNav({ showReviews }: { showReviews: boolean }) {
  const { t, locale } = useI18n();
  return (
    <nav aria-labelledby="footer-nav" className="flex flex-col items-center md:items-start">
      <h2 id="footer-nav" className="text-xl">
        {t("shell.footer.explore")}
      </h2>
      <ul className="mt-2 grid grid-cols-1 justify-items-center gap-x-6 min-[22rem]:grid-cols-2 md:-ms-2 md:justify-items-start">
        {SITE_NAV_ITEMS.filter((item) => item.key !== "home").map((item) => (
          <li key={item.key}>
            <Link to={localePath(locale, item.path)} className={linkClass}>
              {t(`nav.items.${item.key}`)}
            </Link>
          </li>
        ))}
        {showReviews && (
          <li>
            <Link to={localePath(locale, "/reviews")} className={cn(linkClass, "min-w-11 justify-center")}>
              {t("reviews.footerLink")}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}

/**
 * Footer (brand v0.3, S-061): burgundy band under a thin gold rule. The burgundy logo badge
 * (a link home), then contacts, pickup place and the site's pages: stacked and centred on
 * phones, three columns from md. Items with an empty Settings value are omitted (no blank row);
 * Settings text is rendered as React text, so markup in it shows as text (AC6).
 */
export function SiteFooter({ contacts, year, showReviews = false }: { contacts: FooterContacts; year: string; showReviews?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <footer className="band border-t border-gold">
      <div className="mx-auto flex max-w-content flex-col items-center px-4 py-8 text-center md:px-6 md:text-start">
        <Link to={localePath(locale, "/")} className="inline-flex rounded-full">
          {/* Logo badge, version 2 (burgundy fill, cream script, gold ring). Its alt names the link. */}
          <img src="/brand/logo-badge-burgundy.svg" alt={t("shell.footer.home")} width={112} height={112} loading="lazy" decoding="async" className="size-24 md:size-28" />
        </Link>
        <div className="mt-6 grid w-full grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
          <FooterContactList contacts={contacts} />
          {contacts.pickupAddress && <FooterPickup address={contacts.pickupAddress} mapUrl={contacts.mapUrl} />}
          <FooterNav showReviews={showReviews} />
        </div>
        <span aria-hidden="true" className="mt-8 block h-px w-16 bg-band-gold" />
        <p className="mt-4 text-sm text-muted-foreground">{t("shell.footer.copyright", { year })}</p>
      </div>
    </footer>
  );
}
