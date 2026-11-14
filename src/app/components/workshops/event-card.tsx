// Workshop events on the customer site (E-15 S-302, S-303): the card of the /workshops list and the
// facts block of the event page. Plain server-rendered markup: no state, no effects, so the
// browsing page gains no JavaScript of its own (NFR-001).
import { Armchair, CalendarHeart, Clock, MapPin } from "lucide-react";
import { Link } from "react-router";
import { useI18n } from "~/i18n/react";
import type { WebPhoto } from "~/lib/images";
import { formatRupees, localePath } from "~/lib/locale";

/** What the loader sends per event: the repo's PublicEvent plus labels formatted on the server. */
export interface EventView {
  slug: string;
  title: string;
  description: string;
  photo: WebPhoto | null;
  eventOn: string;
  dateLabel: string;
  timeLabel: string;
  address: string;
  mapUrl: string | null;
  priceRs: number;
  placesLeft: number;
}

/** 4:3 card photo: full width on a phone, a third of the column from 768 px. */
export const EVENT_CARD_SIZES = "(min-width: 64rem) 20rem, (min-width: 48rem) 45vw, 100vw";

export function PlacesLeft({ count }: { count: number }) {
  const { t } = useI18n();
  if (count === 0) {
    return <span className="inline-flex min-h-7 items-center rounded-full border-2 border-primary-strong px-3 text-sm font-semibold text-primary-strong">{t("workshops.full")}</span>;
  }
  return <span className="font-semibold">{t("workshops.placesLeft", { count })}</span>;
}

export function EventFacts({ event }: { event: EventView }) {
  const { t } = useI18n();
  return (
    <ul className="grid gap-2">
      <li className="flex items-start gap-2">
        <CalendarHeart aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
        <span>
          <span className="sr-only">{t("workshops.when")}: </span>
          <time dateTime={event.eventOn}>{event.dateLabel}</time>
        </span>
      </li>
      <li className="flex items-start gap-2">
        <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
        <span>{event.timeLabel}</span>
      </li>
      <li className="flex items-start gap-2">
        <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 wrap-anywhere">
          <span className="sr-only">{t("workshops.where")}: </span>
          {event.address}
        </span>
      </li>
      <li className="flex items-start gap-2">
        <Armchair aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t("workshops.perCake", { price: formatRupees(event.priceRs) })}</span>
          <PlacesLeft count={event.placesLeft} />
        </span>
      </li>
    </ul>
  );
}

export function EventPhoto({ photo, sizes, eager = false }: { photo: WebPhoto; sizes: string; eager?: boolean }) {
  return (
    <img
      src={photo.url}
      srcSet={photo.srcSet}
      sizes={photo.srcSet && sizes}
      width={photo.width}
      height={photo.height}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="aspect-[4/3] h-auto w-full rounded-card bg-decorative object-cover"
    />
  );
}

export function EventCard({ event, index }: { event: EventView; index: number }) {
  const { t, locale } = useI18n();
  const href = localePath(locale, `/workshops/${event.slug}`);
  const full = event.placesLeft === 0;
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 sm:p-4">
      {event.photo && <EventPhoto photo={event.photo} sizes={EVENT_CARD_SIZES} eager={index === 0} />}
      <h3 className="min-w-0 text-xl wrap-anywhere">
        <Link to={href} className="inline-flex min-h-11 max-w-full items-center link">
          {event.title}
        </Link>
      </h3>
      <EventFacts event={event} />
      <p>
        <Link to={href} aria-label={`${event.title}: ${full ? t("workshops.seeFull") : t("workshops.see")}`} className="inline-flex min-h-11 items-center font-semibold link">
          {full ? t("workshops.seeFull") : t("workshops.see")}
        </Link>
      </p>
    </li>
  );
}
