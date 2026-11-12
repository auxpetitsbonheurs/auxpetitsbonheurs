import { CircleSlash, MessageCircle, RotateCw } from "lucide-react";
import { useEffect } from "react";
import { Link, useRevalidator, useRouteLoaderData } from "react-router";
import type { FooterContacts } from "~/components/shell/site-footer";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { type CollectionSection, collectionSections, fromPriceRs, needsOptions } from "~/domain/collection";
import type { MenuEntry, MenuProduct } from "~/domain/menu";
import { t as serverT } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";
import { formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { menuStore, useMenuState } from "~/lib/menu-cache";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { loadMenu } from "~/server/menu.server";
import { publicConfigContext } from "~/server/public-config.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/menu";

/** Its meta uses seoMeta: the site layout leaves the brand share image to it. */
export const handle = SEO_HANDLE;

/**
 * `site/menu` loader ("Our collection", FR-077, S-244): the public menu read by the same code as
 * GET /api/menu (ADR-0004), so the page and the browser cache can never disagree on what is
 * listed. The server-rendered page holds the full list (no spinner on a cold visit).
 */
export async function loader({ context, url }: Route.LoaderArgs) {
  const menu = await timed(context, "menu", () =>
    loadMenu({ db: context.get(requestDbContext).db, supabaseUrl: context.get(publicConfigContext).supabaseUrl, now: context.get(clockContext).now() }),
  );
  const locale = localeFromPathname(url.pathname);
  return { menu, title: serverT("collection.title", locale), description: serverT("collection.metaDescription", locale) };
}

/**
 * A client navigation to /menu renders from the cached menu at once (`apb_menu`) and revalidates
 * it in the background (S-244 AC5); with no cache yet it asks the server.
 */
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const entry = menuStore.state().entry;
  if (!entry) return serverLoader();
  void menuStore.revalidate();
  return { menu: entry, title: null, description: null };
}

export function meta({ loaderData, matches, location }: Route.MetaArgs) {
  // A client navigation from the cache carries no title: keep the one the root messages give.
  const root = matches.find((m) => m?.id === "root")?.loaderData as { messages?: { collection?: { title?: string; metaDescription?: string } } } | undefined;
  const title = loaderData?.title ?? root?.messages?.collection?.title ?? "";
  const description = loaderData?.description ?? root?.messages?.collection?.metaDescription ?? "";
  // S-253 AC1, AC5: canonical without filters or anchors, never noindex.
  return seoMeta({ origin: rootOrigin(matches), locale: localeFromPathname(location.pathname), path: "/menu", title, description });
}

/** The footer's contacts (layout loader), for the WhatsApp links of the empty and error states. */
function useWhatsapp(): string | null {
  const { locale } = useI18n();
  const layout = useRouteLoaderData(`site-${locale}`) as { contacts?: FooterContacts } | undefined;
  return layout?.contacts?.whatsapp ?? null;
}

function WhatsappLink({ number }: { number: string }) {
  const { t } = useI18n();
  return (
    <Button asChild variant="secondary" className="mt-4">
      <a href={whatsappHref(number)}>
        <MessageCircle aria-hidden="true" strokeWidth={1.75} />
        {t("collection.whatsapp")}
      </a>
    </Button>
  );
}

/** Cards above this index load eagerly (the first row at every width); the rest are lazy. */
const EAGER_CARDS = 4;

/**
 * One product card (S-244 AC2, AC3): photo, name, "from Rs X" and the call to action. The name
 * is the card's single link; its hit area is stretched over the whole card, so the card is one
 * tab stop and one tap target, and the photo's alt (the name) is not read twice. Price and
 * sold-out label describe the link.
 */
function ProductCard({ product, index }: { product: MenuProduct; index: number }) {
  const { t, locale } = useI18n();
  const name = localized(product.name, locale);
  const photo = product.photos[0];
  const soldOut = product.status === "sold_out";
  const priceId = `price-${product.id}`;
  const statusId = `status-${product.id}`;
  return (
    <li className="relative flex flex-col overflow-hidden rounded-card border border-border bg-card has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      {photo ? (
        <img
          src={photo.url}
          alt={name}
          width={photo.width}
          height={photo.height}
          loading={index < EAGER_CARDS ? "eager" : "lazy"}
          decoding="async"
          className="aspect-4/3 h-auto w-full bg-decorative object-cover"
        />
      ) : (
        <div aria-hidden="true" className="aspect-4/3 w-full bg-decorative" />
      )}
      <div className="flex flex-1 flex-col gap-1 p-3 min-[23rem]:p-4">
        <h3 className="text-lg leading-snug wrap-anywhere md:text-xl">
          {/* The focus ring is drawn around the whole card (the li's has-[a:focus-visible] outline), not the name. */}
          <Link
            to={localePath(locale, `/menu/${encodeURIComponent(product.slug)}`)}
            aria-describedby={soldOut ? `${priceId} ${statusId}` : priceId}
            className="inline-flex min-h-11 min-w-11 items-center text-foreground outline-none after:absolute after:inset-0 after:content-[''] hover:text-primary-strong"
          >
            {name}
          </Link>
        </h3>
        <p id={priceId} className="text-sm font-semibold whitespace-nowrap text-primary-strong tabular-nums">
          {t("collection.fromPrice", { price: formatRupees(fromPriceRs(product), locale) })}
        </p>
        {soldOut && (
          <p id={statusId} className="inline-flex items-center gap-1 text-sm font-semibold">
            <CircleSlash aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t("collection.soldOut")}
          </p>
        )}
        <p aria-hidden="true" className="mt-auto pt-2 text-sm underline underline-offset-4 text-primary-strong">
          {needsOptions(product) ? t("collection.chooseOptions") : t("collection.view")} <span>→</span>
        </p>
      </div>
    </li>
  );
}

function TypeSection({ section, offset }: { section: CollectionSection; offset: number }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby={`type-${section.type}`} className="scroll-mt-4">
      <h2 id={`type-${section.type}`} className="section-title text-2xl md:text-3xl">
        {t(`collection.types.${section.type}`)}
      </h2>
      {/* 2 columns on phones (320 and 375 px), 3 at md, 4 at lg (AC7); 1 below 20rem (200% zoom on a 320 px phone). */}
      <ul className="mt-4 grid grid-cols-1 gap-3 min-[20rem]:grid-cols-2 min-[23rem]:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {section.products.map((product, i) => (
          <ProductCard key={product.id} product={product} index={offset + i} />
        ))}
      </ul>
    </section>
  );
}

/** In-page links to each type, so keyboard users jump between sections (AC7). Only with 2+ types. */
function TypeAnchors({ sections }: { sections: CollectionSection[] }) {
  const { t } = useI18n();
  if (sections.length < 2) return null;
  return (
    <nav aria-label={t("collection.jumpTo")} className="mt-4">
      <ul className="flex flex-wrap justify-center gap-2">
        {sections.map((s) => (
          <li key={s.type}>
            <a href={`#type-${s.type}`} className="inline-flex min-h-11 items-center rounded-full border border-border-input px-4 text-sm font-semibold text-primary-strong hover:bg-muted">
              {t(`collection.types.${s.type}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function EmptyCollection() {
  const { t } = useI18n();
  const whatsapp = useWhatsapp();
  return (
    <div className="mx-auto mt-8 max-w-measure text-center">
      <p className="text-lg">{t("collection.empty")}</p>
      {whatsapp && (
        <>
          <p className="mt-2 text-muted-foreground">{t("collection.emptyHint")}</p>
          <WhatsappLink number={whatsapp} />
        </>
      )}
    </div>
  );
}

/** The newest of the loader's copy and the browser cache, which the loader's copy seeds. */
function useCollectionMenu(fromLoader: MenuEntry) {
  const cached = useMenuState();
  useEffect(() => menuStore.offer(fromLoader), [fromLoader]);
  // domain/menu `fresherEntry`, inlined: a runtime import of domain/menu would pull the pricing
  // module into a chunk shared with the product editor, whose route is at its JS budget.
  return cached.entry && cached.entry.data.generatedAt >= fromLoader.data.generatedAt ? cached.entry.data : fromLoader.data;
}

export default function Collection({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const menu = useCollectionMenu(loaderData.menu);
  const sections = collectionSections(menu, menu.today);
  const offsets = sections.map((_, i) => sections.slice(0, i).reduce((n, s) => n + s.products.length, 0));
  return (
    <>
      <header className="text-center">
        <h1>{t("collection.title")}</h1>
        <span aria-hidden="true" className="mx-auto mt-3 block h-px w-16 bg-gold" />
        {sections.length > 0 && <p className="mx-auto mt-3 max-w-measure text-muted-foreground">{t("collection.intro")}</p>}
        <TypeAnchors sections={sections} />
      </header>
      {sections.length === 0 ? (
        <EmptyCollection />
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {sections.map((section, i) => (
            <TypeSection key={section.type} section={section} offset={offsets[i] ?? 0} />
          ))}
        </div>
      )}
    </>
  );
}

/** The menu could not load (AC6): a calm section error with Retry and WhatsApp; the frame stays. */
export function ErrorBoundary() {
  const { t } = useI18n();
  const whatsapp = useWhatsapp();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== "idle";
  return (
    <>
      <h1 className="text-center">{t("collection.title")}</h1>
      <Alert tone="danger" role="alert" title={t("collection.errorTitle")} className="mx-auto mt-8 max-w-measure">
        <p>{t("collection.errorBody")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void revalidator.revalidate()} aria-busy={retrying || undefined} disabled={retrying}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} className={retrying ? "motion-safe:animate-spin" : undefined} />
            {t("collection.retry")}
          </Button>
          {whatsapp && (
            <Button asChild variant="secondary">
              <a href={whatsappHref(whatsapp)}>
                <MessageCircle aria-hidden="true" strokeWidth={1.75} />
                {t("collection.whatsapp")}
              </a>
            </Button>
          )}
        </div>
      </Alert>
    </>
  );
}
