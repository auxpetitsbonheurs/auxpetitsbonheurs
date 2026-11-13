// Product photos (S-065 AC1, AC7, AC9): one photo at a time in a box sized from the first photo
// (no layout shift), "Photo 1 of 4" announced politely, Previous/Next buttons and the arrow keys
// (swipe is an extra, never the only way). A missing or failed photo becomes a named placeholder
// of the same size. Changing photo is an instant swap: nothing moves under reduced motion.
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { type KeyboardEvent, type TouchEvent, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";

export interface ProductPhoto {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/** A swipe shorter than this (px) is a tap or a scroll, not a photo change. */
const SWIPE_MIN = 40;

function Placeholder({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <div role="img" aria-label={t("productContent.photoMissing", { name })} className="flex h-full w-full flex-col items-center justify-center gap-2 bg-decorative p-4 text-center text-primary-strong">
      <ImageOff aria-hidden="true" className="size-10" strokeWidth={1.5} />
      <span aria-hidden="true" className="font-heading text-xl wrap-anywhere">
        {name}
      </span>
    </div>
  );
}

/** The current photo; a load error (also one that happened before hydration) swaps in the placeholder. */
function Photo({ photo, first, name }: { photo: ProductPhoto; first: boolean; name: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return <Placeholder name={name} />;
  return (
    <img
      ref={ref}
      src={photo.url}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      fetchPriority={first ? "high" : undefined}
      decoding={first ? undefined : "async"}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function useCarousel(count: number) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const go = (step: number) => setIndex((i) => (i + step + count) % count);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      go(event.key === "ArrowLeft" ? -1 : 1);
    }
  };
  const onTouchStart = (event: TouchEvent) => (touchX.current = event.touches[0]?.clientX ?? null);
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchX.current;
    const end = event.changedTouches[0]?.clientX;
    touchX.current = null;
    if (start !== null && end !== undefined && Math.abs(end - start) >= SWIPE_MIN) go(end < start ? 1 : -1);
  };
  return { index, go, onKeyDown, onTouchStart, onTouchEnd };
}

export function ProductPhotos({ photos, name }: { photos: ProductPhoto[]; name: string }) {
  const { t } = useI18n();
  const { index, go, onKeyDown, onTouchStart, onTouchEnd } = useCarousel(Math.max(photos.length, 1));
  const first = photos[0];
  const current = photos[index];
  const box = first ? { aspectRatio: `${first.width} / ${first.height}` } : { aspectRatio: "4 / 3" };
  return (
    <div role="group" aria-roledescription={t("productContent.carousel")} aria-label={name} onKeyDown={onKeyDown} className="min-w-0">
      <div style={box} className="overflow-hidden rounded-lg bg-decorative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {current ? <Photo key={current.url} photo={current} first={index === 0} name={name} /> : <Placeholder name={name} />}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex min-h-11 items-center justify-between gap-2">
          <Button type="button" variant="outline" size="icon" aria-label={t("productContent.previousPhoto")} onClick={() => go(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p aria-live="polite" className="flex-1 text-center text-sm text-muted-foreground tabular-nums">
            {t("productContent.photoCount", { current: index + 1, total: photos.length })}
          </p>
          <Button type="button" variant="outline" size="icon" aria-label={t("productContent.nextPhoto")} onClick={() => go(1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
