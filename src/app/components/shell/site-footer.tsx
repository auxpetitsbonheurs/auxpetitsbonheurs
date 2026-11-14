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
  /** http(s) only (settings repo); null hides the icon. */
  instagramUrl: string | null;
  /** https on facebook.com or fb.com only (settings repo, S-283); null hides the icon. */
  facebookUrl: string | null;
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
  /** Off-site pages (the map) open in a new tab, announced to screen readers. */
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

// The two marks below use Instagram's and Facebook's own colours (the Owner's choice, S-283):
// third-party brand colours, so they are not design tokens.

/** Id of the hidden "opens in a new tab" text the social icons point to (aria-describedby). */
const NEW_TAB_ID = "footer-new-tab";

/**
 * Instagram mark as the Owner asked (S-283): a round button in Instagram's yellow-orange-pink-
 * purple gradient with a white outlined camera. Inline SVG (lucide ships no brand marks); the
 * gradient id is unique because the footer renders once per page.
 */
function InstagramMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 36 36" className="size-9">
      <defs>
        <radialGradient id="apb-instagram-gradient" cx="0.3" cy="1.07" r="1.3">
          <stop offset="0" stopColor="#fdf497" />
          <stop offset="0.08" stopColor="#fdf497" />
          <stop offset="0.45" stopColor="#fd5949" />
          <stop offset="0.6" stopColor="#d6249f" />
          <stop offset="0.9" stopColor="#285aeb" />
        </radialGradient>
      </defs>
      <circle cx="18" cy="18" r="18" fill="url(#apb-instagram-gradient)" />
      <g fill="none" stroke="#fff" strokeWidth="2">
        <rect x="10" y="10" width="16" height="16" rx="4.5" />
        <circle cx="18" cy="18" r="3.8" />
      </g>
      <circle cx="22.6" cy="13.4" r="1.1" fill="#fff" />
    </svg>
  );
}

/** Facebook mark as the Owner asked (S-283): a solid Facebook-blue circle with the white "f" rising out of its base. */
function FacebookMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 36 36" className="size-9">
      <defs>
        <clipPath id="apb-facebook-clip">
          <circle cx="18" cy="18" r="18" />
        </clipPath>
      </defs>
      <circle cx="18" cy="18" r="18" fill="#1877f2" />
      <path
        clipPath="url(#apb-facebook-clip)"
        fill="#fff"
        d="m24.6 23.2.8-5.2h-5v-3.4c0-1.4.7-2.8 2.9-2.8h2.3V7.4s-2.1-.4-4.1-.4c-4.2 0-6.9 2.5-6.9 7.1V18H10v5.2h4.6V36h5.8V23.2z"
      />
    </svg>
  );
}

interface SocialLinkProps {
  href: string;
  label: string;
  mark: ReactNode;
}

/** 44 px round target around a 36 px mark; the band's cream focus ring (app.css) follows the circle. */
function SocialLink({ href, label, mark }: SocialLinkProps) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        aria-describedby={NEW_TAB_ID}
        className="inline-flex size-11 items-center justify-center rounded-full transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        {mark}
      </a>
    </li>
  );
}

/** Instagram and Facebook icons under the logo (S-283), each only when its link is set; nothing at all with neither. */
function FooterSocial({ instagramUrl, facebookUrl }: Pick<FooterContacts, "instagramUrl" | "facebookUrl">) {
  const { t } = useI18n();
  if (!instagramUrl && !facebookUrl) return null;
  return (
    <>
      <ul id="footer-social" aria-label={t("shell.footer.social")} className="mt-3 flex items-center gap-2">
        {instagramUrl && <SocialLink href={instagramUrl} label={t("shell.footer.instagramLink")} mark={<InstagramMark />} />}
        {facebookUrl && <SocialLink href={facebookUrl} label={t("shell.footer.facebookLink")} mark={<FacebookMark />} />}
      </ul>
      <span id={NEW_TAB_ID} hidden>
        {t("sitePage.newTab")}
      </span>
    </>
  );
}

/** The bakery's contacts and pickup place, each item only when Settings has a value (S-061 AC3). */
function FooterContactList({ contacts }: { contacts: FooterContacts }) {
  const { t } = useI18n();
  const { whatsapp, phone, email } = contacts;
  if (!whatsapp && !phone && !email) return null;
  return (
    <section aria-labelledby="footer-contact" className="flex flex-col items-center md:items-start">
      <h2 id="footer-contact" className="text-xl">
        {t("shell.footer.heading")}
      </h2>
      <ul className="mt-2 flex flex-col items-center gap-1 md:-ms-2 md:items-start">
        {whatsapp && <ContactLink href={whatsappHref(whatsapp)} icon={<MessageCircle {...iconProps} />} label={t("shell.footer.whatsapp")} value={whatsapp} keepTogether />}
        {phone && <ContactLink href={telHref(phone)} icon={<Phone {...iconProps} />} label={t("shell.footer.phone")} value={phone} keepTogether />}
        {email && <ContactLink href={mailHref(email)} icon={<Mail {...iconProps} />} label={t("shell.footer.email")} value={email} />}
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
        <li>
          <Link to={localePath(locale, "/privacy")} className={linkClass}>
            {t("privacyLink.footer")}
          </Link>
        </li>
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
        <FooterSocial instagramUrl={contacts.instagramUrl} facebookUrl={contacts.facebookUrl} />
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
