import { MessageCircle, Phone } from "lucide-react";
import { Link } from "react-router";
import { SitePageError } from "~/components/site/page-error";
import { PlainText } from "~/components/site/plain-text";
import { Button } from "~/components/ui/button";
import { t as serverT } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { telHref, whatsappHref } from "~/lib/contact";
import { type Locale, localeFromPathname, localePath } from "~/lib/locale";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import { requestDbContext } from "~/server/db.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { contentPagePlaceholders } from "~/server/seo-pages.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/custom-order";

/** The page text Owner or Admin edits (S-245 page key `custom_order`): intro and body. */
export interface CustomOrderText {
  intro: string;
  body: string;
}

/**
 * Interim text until the `site_page` read exists (S-245): the copywriter's neutral placeholder
 * (no prices, no lead times; the notice comes from Settings). S-245 swaps this for the stored page.
 */
function placeholderText(locale: Locale): CustomOrderText {
  return { intro: serverT("customOrderPage.intro", locale), body: serverT("customOrderPage.what", locale) };
}

/** Its meta uses seoMeta: the root Layout leaves the brand share image to it. */
export const handle = SEO_HANDLE;

/**
 * `site/custom-order` loader (S-252, FR-080): the explanation, the notice from Settings and the
 * contacts for the call to action. Query parameters (`?fromGallery=`, S-069) are ignored: the
 * page is the same for every visitor until the E-08 request form (S-151) takes this route.
 */
export async function loader({ url, context }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const [settings, placeholders] = await Promise.all([timed(context, "settings", () => getSiteSettings(db)), contentPagePlaceholders(db)]);
  return {
    title: serverT("customOrderPage.title", locale),
    description: serverT("customOrderPage.metaDescription", locale),
    whatsapp: settings.footer.whatsapp,
    phone: settings.footer.phone,
    noticeDays: settings.noticeDays,
    text: placeholderText(locale),
    isPlaceholder: placeholders.custom_order,
  };
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
    noindex: loaderData.isPlaceholder,
  });
}

/**
 * The one call to action (AC2): WhatsApp with a pre-filled message; without a WhatsApp number
 * the phone; without either, the Contact page. When S-151 ships, the form takes this place and
 * WhatsApp becomes a secondary link (AC3).
 */
function CallToAction({ whatsapp, phone }: { whatsapp: string | null; phone: string | null }) {
  const { t, locale } = useI18n();
  if (whatsapp) {
    return (
      <Button asChild size="lg" className="w-full sm:w-auto">
        <a href={whatsappHref(whatsapp, t("customOrderPage.greeting"))}>
          <MessageCircle aria-hidden="true" strokeWidth={1.75} />
          {t("customOrderPage.cta")}
        </a>
      </Button>
    );
  }
  if (phone) {
    return (
      <Button asChild size="lg" className="w-full sm:w-auto">
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

export default function CustomOrder({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { whatsapp, phone, noticeDays, text } = loaderData;
  return (
    <article className="mx-auto flex max-w-measure flex-col gap-8">
      <header className="text-center">
        <h1>{t("customOrderPage.title")}</h1>
        <span aria-hidden="true" className="mx-auto mt-3 block h-px w-16 bg-gold" />
        {text.intro && <PlainText text={text.intro} className="mt-3 justify-items-center text-lg text-muted-foreground" />}
        <div className="mt-6 flex justify-center">
          <CallToAction whatsapp={whatsapp} phone={phone} />
        </div>
      </header>
      {text.body && (
        <section aria-labelledby="custom-what" className="flex flex-col gap-3">
          <h2 id="custom-what" className="section-title-start text-2xl">{t("customOrderPage.whatHeading")}</h2>
          <PlainText text={text.body} />
        </section>
      )}
      <section aria-labelledby="custom-how" className="flex flex-col gap-3">
        <h2 id="custom-how" className="section-title-start text-2xl">{t("customOrderPage.howHeading")}</h2>
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
        <h2 id="custom-notice" className="section-title-start text-2xl">{t("customOrderPage.noticeHeading")}</h2>
        <p>{noticeDays > 0 ? t("customOrderPage.notice", { count: noticeDays }) : t("customOrderPage.noticeSoon")}</p>
      </section>
      {/* Repeat the call to action at the end of the page (one clear next step after reading). */}
      <div className="flex justify-center border-t border-border pt-6">
        <CallToAction whatsapp={whatsapp} phone={phone} />
      </div>
    </article>
  );
}

export function ErrorBoundary() {
  const { t } = useI18n();
  return <SitePageError title={t("customOrderPage.title")} />;
}
