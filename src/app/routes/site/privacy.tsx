import type { ReactNode } from "react";
import { namespaceMessages, t as serverT } from "~/i18n/catalog.server";
import { ExtraMessages, useI18n } from "~/i18n/react";
import { RETENTION, openPrivacyItems, privacyFactsWith } from "~/domain/privacy-facts";
import { formatLongDate } from "~/domain/time";
import { mailHref, whatsappHref } from "~/lib/contact";
import { localeFromPathname } from "~/lib/locale";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import { requestDbContext } from "~/server/db.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/privacy";

export const handle = SEO_HANDLE;

/**
 * `site/privacy` (S-225, NFR-004): the short privacy note in EN and FR. Its facts and periods come
 * from domain/privacy-facts (the Owner's decisions; the periods match the purge jobs), the legal name,
 * BRN and address from Settings → Invoice (S-127, falling back to the placeholder); an open
 * `[TO CONFIRM]` item shows "to be confirmed" and keeps the page out of search results. The
 * contact for erase requests is the Settings WhatsApp and email (Owner only, S-058).
 */
export async function loader({ url, context }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const settings = await timed(context, "settings", () => getSiteSettings(context.get(requestDbContext).db));
  // S-127: the legal name, BRN and address the Owner enters once in Settings → Invoice.
  const facts = privacyFactsWith(settings.business ?? { legalName: null, brn: null, address: null });
  return {
    messages: namespaceMessages(locale, "privacy"),
    title: serverT("privacy.title", locale),
    description: serverT("privacy.metaDescription", locale),
    facts,
    updatedLabel: formatLongDate(facts.updatedOn, locale),
    open: openPrivacyItems(facts).length > 0,
    whatsapp: settings.footer.whatsapp,
    email: settings.footer.email,
  };
}

export function meta({ loaderData, matches, location }: Route.MetaArgs) {
  if (!loaderData) return [];
  const locale = localeFromPathname(location.pathname);
  return seoMeta({ origin: rootOrigin(matches), locale, path: "/privacy", title: loaderData.title, description: loaderData.description, noindex: loaderData.open });
}

function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-2xl">
        {heading}
      </h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 ps-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

type Data = Route.ComponentProps["loaderData"];

function PrivacyNote({ data }: { data: Data }) {
  const { t } = useI18n();
  const { facts } = data;
  const value = (fact: string | null) => fact ?? `[${t("privacy.toConfirm")}]`;
  const contact = [
    data.whatsapp && { href: whatsappHref(data.whatsapp), label: t("privacy.rights.whatsapp", { value: data.whatsapp }) },
    data.email && { href: mailHref(data.email), label: t("privacy.rights.email", { value: data.email }) },
  ].filter((link): link is { href: string; label: string } => Boolean(link));
  return (
    <article className="max-w-measure">
      <h1>{t("privacy.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("privacy.updated", { date: data.updatedLabel })}</p>
      <p className="mt-4">{t("privacy.intro")}</p>

      <Section id="privacy-who" heading={t("privacy.who.heading")}>
        <p>{t("privacy.who.body")}</p>
        <List items={[t("privacy.who.name", { value: value(facts.legalName) }), t("privacy.who.address", { value: value(facts.address) }), t("privacy.who.brn", { value: value(facts.brn) })]} />
      </Section>

      <Section id="privacy-collect" heading={t("privacy.collect.heading")}>
        <List items={["order", "request", "account", "review", "technical"].map((key) => t(`privacy.collect.${key}`))} />
      </Section>

      <Section id="privacy-see" heading={t("privacy.see.heading")}>
        <p>{t("privacy.see.body")}</p>
        <List items={[t("privacy.see.supabase", { region: value(facts.databaseRegion) }), t("privacy.see.cloudflare"), t("privacy.see.resend"), t("privacy.see.google")]} />
        <p>{t("privacy.see.abroad")}</p>
      </Section>

      <Section id="privacy-cookies" heading={t("privacy.cookies.heading")}>
        <p>{t("privacy.cookies.body")}</p>
      </Section>

      <Section id="privacy-links" heading={t("privacy.links.heading")}>
        <p>{t("privacy.links.body")}</p>
      </Section>

      <Section id="privacy-keep" heading={t("privacy.keep.heading")}>
        {!facts.retentionConfirmed && <p>{t("privacy.keep.proposed")}</p>}
        <List
          items={[
            t("privacy.keep.orders", { years: RETENTION.orderYears }),
            t("privacy.keep.account"),
            t("privacy.keep.photos", { days: RETENTION.requestPhotoDays, hours: RETENTION.unusedUploadHours }),
            t("privacy.keep.emails", { days: RETENTION.emailContentDays }),
            t("privacy.keep.reviews"),
            t("privacy.keep.backups", { weeks: RETENTION.backupWeeks }),
          ]}
        />
      </Section>

      <Section id="privacy-rights" heading={t("privacy.rights.heading")}>
        <p>{t("privacy.rights.body", { days: RETENTION.eraseDays })}</p>
        {contact.length > 0 && (
          <ul className="flex flex-col gap-1 sm:-ms-2">
            {contact.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="inline-flex min-h-11 max-w-full items-center rounded-md px-2 link wrap-anywhere">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="privacy-law" heading={t("privacy.law.heading")}>
        <p>{t("privacy.law.body", { status: facts.regimeConfirmed ? t("privacy.law.confirmed") : t("privacy.toConfirm") })}</p>
      </Section>
    </article>
  );
}

export default function Privacy({ loaderData }: Route.ComponentProps) {
  return (
    <ExtraMessages messages={loaderData.messages}>
      <PrivacyNote data={loaderData} />
    </ExtraMessages>
  );
}
