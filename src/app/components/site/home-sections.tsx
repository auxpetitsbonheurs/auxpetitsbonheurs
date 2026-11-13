// Home page sections (S-063, FR-004) in the Owner's burgundy reference: hero, the three
// promises, "Our collection" category cards, product rows, How it works, the custom-cake band
// and the gallery preview. Each section renders nothing when it has no data (AC3).
import { ArrowRight, Cake, CircleSlash, Cookie, Heart, Leaf, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees, localePath } from "~/lib/locale";
import type { HomeCategory, HomeData, HomePhoto, HomeProduct, HomePromoCard } from "~/domain/home";
import { CARD_SIZES, CATEGORY_SIZES, GALLERY_PREVIEW_SIZES, HERO_SIZES } from "~/lib/photo-sizes";

const iconProps = { "aria-hidden": true, strokeWidth: 1.5 } as const;

/** Hero (AC1, AC6): tagline as the page's h1, intro, the collection button; the photo is the LCP image. */
export function HomeHero({ hero }: { hero: HomeData["hero"] }) {
  const { t, locale } = useI18n();
  const title = hero.tagline ? localized(hero.tagline, locale) : t("home.heroTitle");
  return (
    <section aria-labelledby="home-title" className="-mx-4 -mt-8 grid grid-cols-1 overflow-hidden bg-card md:-mx-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="order-2 flex flex-col items-center gap-4 px-4 py-8 text-center md:order-1 md:items-start md:justify-center md:px-10 md:py-14 md:text-start lg:px-14">
        <h1 id="home-title" className="max-w-[16ch] wrap-anywhere min-[20rem]:text-display md:text-display-lg">
          {title}
        </h1>
        <span aria-hidden="true" className="h-px w-16 bg-gold" />
        <p className="max-w-sm text-lg text-muted-foreground">{t("home.intro")}</p>
        <Link
          to={localePath(locale, "/menu")}
          className="mt-1 inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-2 text-center font-semibold text-primary-foreground transition-colors duration-(--motion-fast) hover:bg-primary-strong"
        >
          {t("home.discover")}
          <ArrowRight {...iconProps} className="size-5 shrink-0" />
        </Link>
      </div>
      <div className="relative order-1 md:order-2 md:min-h-[28rem]">
        {/* React hoists this into <head>: the LCP photo is requested before the route scripts compete for the link. */}
        {/* With smaller copies the preload carries the same srcset/sizes, so it fetches the copy the img will use (S-276). */}
        {hero.photo && <link rel="preload" as="image" href={hero.photo.url} imageSrcSet={hero.photo.srcSet} imageSizes={hero.photo.srcSet && HERO_SIZES} fetchPriority="high" />}
        {hero.photo ? (
          <img
            src={hero.photo.url}
            srcSet={hero.photo.srcSet}
            sizes={hero.photo.srcSet && HERO_SIZES}
            alt={t("home.heroAlt")}
            width={hero.photo.width}
            height={hero.photo.height}
            fetchPriority="high"
            decoding="async"
            className="aspect-4/3 h-auto w-full bg-decorative object-cover md:absolute md:inset-0 md:aspect-auto md:h-full"
          />
        ) : (
          // No photo yet: the cream logo badge on the burgundy band (brand v0.3), same box, no broken image.
          <div className="band flex aspect-4/3 w-full items-center justify-center md:absolute md:inset-0 md:aspect-auto md:h-full">
            <img src="/brand/logo-badge-cream.svg" alt="" width={160} height={160} className="size-32 md:size-40" />
          </div>
        )}
      </div>
    </section>
  );
}

/** The three promises under the hero (reference row): icons, labels, thin dividers from 20rem. */
export function HomePromises() {
  const { t } = useI18n();
  const items: [ReactNode, string][] = [
    [<Leaf key="q" {...iconProps} className="size-7" />, t("home.promises.quality")],
    [<Heart key="c" {...iconProps} className="size-7" />, t("home.promises.custom")],
    [<Truck key="d" {...iconProps} className="size-7" />, t("home.promises.delivery")],
  ];
  return (
    <section aria-labelledby="home-promises" className="-mx-4 border-y border-gold/40 bg-muted px-2 py-4 md:-mx-6">
      <h2 id="home-promises" className="sr-only">
        {t("home.promises.heading")}
      </h2>
      <ul className="mx-auto grid max-w-3xl grid-cols-1 gap-3 min-[20rem]:grid-cols-3 min-[20rem]:gap-0 min-[20rem]:divide-x min-[20rem]:divide-gold/40">
        {items.map(([icon, label]) => (
          <li key={label} className="flex flex-col items-center gap-1 px-1 text-center text-sm text-primary-strong md:text-base">
            {icon}
            <span className="wrap-anywhere text-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="section-title text-2xl md:text-3xl">
      {children}
    </h2>
  );
}

const CATEGORY_ICONS: Record<string, typeof Cake> = { cake: Cake, cupcake_box: Cake, dessert: Cookie, seasonal: Leaf };

/** A photo that reserves its box (no layout shift), lazy (below the hero). */
function CardPhoto({ photo, alt, icon, sizes }: { photo: HomePhoto | null; alt: string; icon: typeof Cake; sizes: string }) {
  if (!photo) {
    const Icon = icon;
    return (
      <div aria-hidden="true" className="flex aspect-4/3 w-full items-center justify-center bg-decorative text-primary-strong">
        <Icon {...iconProps} className="size-10" />
      </div>
    );
  }
  return (
    <img
      src={photo.url}
      srcSet={photo.srcSet}
      sizes={photo.srcSet && sizes}
      alt={alt}
      width={photo.width}
      height={photo.height}
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      className="aspect-4/3 h-auto w-full bg-decorative object-cover"
    />
  );
}

/** One card per product type with live products (AC1), a link to its section of the menu. */
function CategoryCard({ category }: { category: HomeCategory }) {
  const { t, locale } = useI18n();
  const name = t(`collection.types.${category.type}`);
  return (
    <li className="relative flex w-full flex-col overflow-hidden rounded-card border border-border bg-card text-center min-[20rem]:w-[calc(50%-0.5rem)] md:w-[calc(25%-0.75rem)]">
      {/* The name is the link (alt="" so it is not read twice); its hit area covers the card. */}
      <CardPhoto photo={category.photo} alt="" icon={CATEGORY_ICONS[category.type] ?? Cake} sizes={CATEGORY_SIZES} />
      <h3 className="px-2 pt-3 text-lg leading-snug wrap-anywhere md:text-xl">
        <Link
          to={`${localePath(locale, "/menu")}#type-${category.type}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary-strong"
        >
          {name}
        </Link>
      </h3>
      <ArrowRight {...iconProps} className="mx-auto mb-3 size-5 text-primary-strong" />
    </li>
  );
}

export function HomeCollection({ categories }: { categories: HomeCategory[] }) {
  const { t, locale } = useI18n();
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="home-collection">
      <SectionHeading id="home-collection">{t("home.collection")}</SectionHeading>
      {/* Centred rows: an odd last card (3 types) sits in the middle, as in the reference. */}
      <ul className="mt-6 flex flex-wrap justify-center gap-4">
        {categories.map((category) => (
          <CategoryCard key={category.type} category={category} />
        ))}
      </ul>
      <p className="mt-4 text-center">
        <Link to={localePath(locale, "/menu")} className="inline-flex min-h-11 items-center font-semibold link">
          {t("home.collectionAll")}
        </Link>
      </p>
    </section>
  );
}

function ProductCard({ product }: { product: HomeProduct }) {
  const { t, locale } = useI18n();
  const name = localized(product.name, locale);
  return (
    <li className="relative flex flex-col overflow-hidden rounded-card border border-border bg-card">
      <CardPhoto photo={product.photo} alt="" icon={Cake} sizes={CARD_SIZES} />
      <div className="flex flex-1 flex-col gap-1 p-3 min-[23rem]:p-4">
        <h3 className="text-lg leading-snug wrap-anywhere">
          <Link
            to={localePath(locale, `/menu/${encodeURIComponent(product.slug)}`)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary-strong"
          >
            {name}
          </Link>
        </h3>
        <p className="text-sm font-semibold whitespace-nowrap text-primary-strong tabular-nums">{t("collection.fromPrice", { price: formatRupees(product.fromPriceRs, locale) })}</p>
        {product.soldOut && (
          <p className="inline-flex items-center gap-1 text-sm font-semibold">
            <CircleSlash aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t("collection.soldOut")}
          </p>
        )}
      </div>
    </li>
  );
}

/** Seasonal specials or featured products (AC1, AC4); absent when empty (AC3). */
export function HomeProductRow({ id, title, products }: { id: string; title: string; products: HomeProduct[] }) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id}>{title}</SectionHeading>
      <ul className="mt-6 grid grid-cols-1 gap-3 min-[20rem]:grid-cols-2 min-[23rem]:gap-4 md:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>
    </section>
  );
}

function PromoCard({ card }: { card: HomePromoCard }) {
  const { locale } = useI18n();
  const title = localized(card.title, locale);
  return (
    <li className="relative flex flex-col overflow-hidden rounded-card border border-gold/60 bg-muted">
      {card.photo && <img src={card.photo.url} alt="" width={card.photo.width} height={card.photo.height} loading="lazy" fetchPriority="low" decoding="async" className="aspect-[3/1] h-auto w-full object-cover" />}
      <div className="p-4">
        <h3 className="text-xl wrap-anywhere">
          {card.href ? (
            <Link to={localePath(locale, card.href)} className="inline-flex min-h-11 items-center gap-2 text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary-strong">
              {title}
              <ArrowRight {...iconProps} className="size-5 shrink-0" />
            </Link>
          ) : (
            title
          )}
        </h3>
        {card.text && <p className="mt-1 text-muted-foreground">{localized(card.text, locale)}</p>}
      </div>
    </li>
  );
}

/** Live promotion cards (AC2), most recent first; absent when none (AC3). */
export function HomeOffers({ cards }: { cards: HomePromoCard[] }) {
  const { t } = useI18n();
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="home-offers">
      <SectionHeading id="home-offers">{t("home.offers")}</SectionHeading>
      <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <PromoCard key={card.id} card={card} />
        ))}
      </ul>
    </section>
  );
}

/** How it works (AC1): three numbered steps. */
export function HomeHowItWorks() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="home-how">
      <SectionHeading id="home-how">{t("home.how.heading")}</SectionHeading>
      <ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {([1, 2, 3] as const).map((n) => (
          <li key={n} data-step className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 wrap-anywhere min-[20rem]:flex-row min-[20rem]:p-4">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold font-heading text-xl text-primary-strong">
              {n}
            </span>
            <div className="min-w-0">
              <h3 className="text-lg">{t(`home.how.step${n}Title`)}</h3>
              <p className="text-muted-foreground">{t(`home.how.step${n}`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The burgundy custom-cake band with a cream outline pill (reference), full width on phones. */
export function HomeCustomBand() {
  const { t, locale } = useI18n();
  return (
    <section aria-labelledby="home-custom" className="band -mx-4 flex flex-col items-center gap-4 border-y border-gold px-6 py-8 text-center sm:mx-0 sm:rounded-lg sm:border md:flex-row md:gap-8 md:px-10 md:text-start">
      <Cake {...iconProps} className="size-14 shrink-0 text-band-gold" />
      <div className="min-w-0 flex-1">
        <h2 id="home-custom" className="text-2xl md:text-3xl">
          {t("home.customBand.title")}
        </h2>
        <p className="mt-1 text-muted-foreground">{t("home.customBand.text")}</p>
      </div>
      <Link
        to={localePath(locale, "/custom-cake")}
        className="inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-full border-2 border-band-foreground px-6 py-2 text-center font-semibold text-band-foreground transition-colors duration-(--motion-fast) hover:bg-band-foreground hover:text-band"
      >
        {t("home.customBand.cta")}
        <ArrowRight {...iconProps} className="size-5 shrink-0" />
      </Link>
    </section>
  );
}

/** Six gallery photos and a link to the gallery (AC1); absent with no photos (AC3). */
export function HomeGalleryPreview({ photos }: { photos: HomeData["gallery"] }) {
  const { t, locale } = useI18n();
  if (photos.length === 0) return null;
  return (
    <section aria-labelledby="home-gallery">
      <SectionHeading id="home-gallery">{t("home.gallery")}</SectionHeading>
      <ul className="mt-6 grid grid-cols-2 gap-2 min-[23rem]:grid-cols-3 md:gap-4">
        {photos.map((photo) => (
          <li key={photo.url}>
            <img
              src={photo.url}
              srcSet={photo.srcSet}
              sizes={photo.srcSet && GALLERY_PREVIEW_SIZES}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              fetchPriority="low"
              decoding="async"
              className="aspect-square h-auto w-full rounded-sm bg-decorative object-cover"
            />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center">
        <Link to={localePath(locale, "/gallery")} className="inline-flex min-h-11 items-center font-semibold link">
          {t("home.galleryAll")}
        </Link>
      </p>
    </section>
  );
}
