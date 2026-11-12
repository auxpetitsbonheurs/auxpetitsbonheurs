// Product editor "Photos" section (S-047, spec "Product editor" 1): up to five photos from
// the camera or the gallery, first = card image, reordered with Move buttons or by dragging
// the photo, removed one by one. Uploads run in the background; the form is never lost.
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, LoaderCircle, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { MAX_PHOTOS } from "~/domain/upload";
import { useI18n } from "~/i18n/react";
import { useDragSort } from "~/lib/use-drag-sort";
import type { PhotoItem, RejectedFile, usePhotoUploads } from "./use-photo-uploads";

type Photos = ReturnType<typeof usePhotoUploads>;

/** Camera roll, camera and files; HEIC is listed so iPhones offer their photos as they are. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

function Progress({ item }: { item: PhotoItem }) {
  const { t } = useI18n();
  if (item.state === "preparing") {
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        {t("admin.product.photos.preparing")}
      </span>
    );
  }
  if (item.state !== "uploading") return null;
  const percent = item.progress === null ? null : Math.round(item.progress * 100);
  return (
    <span className="grid gap-1 text-sm">
      <span className="inline-flex items-center gap-1">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        {percent === null ? t("admin.product.photos.uploading") : t("admin.product.photos.uploadingPercent", { percent })}
      </span>
      {percent !== null && (
        <progress max={100} value={percent} aria-label={t("admin.product.photos.progressLabel", { name: item.fileName })} className="h-2 w-full max-w-40 accent-primary" />
      )}
    </span>
  );
}

function PhotoRow({ item, index, count, name, photos, dragging, handle }: { item: PhotoItem; index: number; count: number; name: string; photos: Photos; dragging: boolean; handle: ReturnType<ReturnType<typeof useDragSort>["handleProps"]> }) {
  const { t } = useI18n();
  const n = index + 1;
  return (
    <li data-sort-item="" data-state={item.state} data-dragging={dragging || undefined} className="flex flex-wrap items-center gap-3 rounded-md border-2 border-input bg-card p-2 data-dragging:border-primary-strong data-[state=failed]:border-destructive">
      {/* The photo itself is the drag handle (pointer); keyboard users have the Move buttons. Alt = product name (AC9). */}
      <span {...handle} className="relative flex size-20 shrink-0 cursor-grab items-center justify-center overflow-hidden rounded-md bg-decorative active:cursor-grabbing">
        {item.url ? <img src={item.url} alt={name} width={80} height={80} className="size-20 object-cover" draggable={false} /> : <GripVertical aria-hidden="true" className="size-6 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-[1_1_8rem]">
        <p className="font-semibold">
          {t("admin.product.photos.photoN", { n })}
          {index === 0 && <span className="ml-2 rounded-sm border border-input px-1.5 text-sm">{t("admin.product.photos.main")}</span>}
        </p>
        <Progress item={item} />
        {item.state === "failed" && (
          <p className="inline-flex items-start gap-1 text-sm font-semibold text-destructive">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t(`admin.product.photos.failed.${item.failure ?? "network"}`)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {item.state === "failed" && item.failure !== "heic" && item.failure !== "unreadable" && item.failure !== "too_big_after" && (
          <Button type="button" variant="outline" size="sm" onClick={() => photos.retry(item.key)} aria-label={t("admin.product.photos.retryN", { n })}>
            <RotateCcw aria-hidden="true" />
            {t("admin.product.photos.retry")}
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => photos.move(index, index - 1)} aria-label={t("admin.product.photos.moveEarlier", { n })}>
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" disabled={index === count - 1} onClick={() => photos.move(index, index + 1)} aria-label={t("admin.product.photos.moveLater", { n })}>
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => photos.remove(item.key)} aria-label={t("admin.product.photos.removeN", { n })}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

export function PhotoManager({ photos, productName, error, onChange, announce }: { photos: Photos; productName: string; error?: string; onChange: () => void; announce: (text: string) => void }) {
  const { t } = useI18n();
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const { items } = photos;
  const full = items.length >= MAX_PHOTOS;
  const name = productName.trim() || t("admin.product.photos.unnamed");
  const drag = useDragSort({
    container: list,
    onMove: (from, to) => {
      photos.move(from, to);
      onChange();
    },
    onDrop: (_from, to) => announce(t("admin.product.photos.announceMoved", { n: to + 1, count: items.length })),
  });

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (files.length === 0) return;
    const refused = photos.add(files, MAX_PHOTOS - items.length);
    setRejected(refused);
    if (files.length > refused.length) onChange();
  };

  return (
    <fieldset id="photos" tabIndex={-1} aria-describedby="photos-hint" className="outline-none">
      <legend className="mb-1 text-xl font-semibold">{t("admin.product.photos.legend")}</legend>
      <p id="photos-hint" className="text-sm text-muted-foreground">
        {t("admin.product.photos.hint", { max: MAX_PHOTOS })}
      </p>
      {items.length > 0 && (
        <ol ref={list} className="mt-3 grid gap-2" aria-label={t("admin.product.photos.listLabel")}>
          {items.map((item, index) => (
            <PhotoRow
              key={item.key}
              item={item}
              index={index}
              count={items.length}
              name={name}
              photos={{
                ...photos,
                move: (from, to) => {
                  photos.move(from, to);
                  onChange();
                  announce(t("admin.product.photos.announceMoved", { n: to + 1, count: items.length }));
                },
                remove: (key) => {
                  photos.remove(key);
                  onChange();
                  announce(t("admin.product.photos.announceRemoved", { n: index + 1, count: items.length - 1 }));
                },
              }}
              dragging={drag.dragging === index}
              handle={drag.handleProps(index)}
            />
          ))}
        </ol>
      )}
      <div className="mt-3">
        {/* A real file input inside the label: one 44 px target, opens camera or gallery on phones. */}
        <label className={`relative inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-input bg-card px-4 py-2 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring ${full ? "opacity-60" : "cursor-pointer hover:bg-accent"}`}>
          <ImagePlus aria-hidden="true" className="size-5" />
          {t("admin.product.photos.add")}
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            disabled={full}
            aria-describedby={full ? "photos-full" : "photos-hint"}
            onChange={choose}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
        {full && (
          <p id="photos-full" className="mt-1 text-sm font-semibold">
            {t("admin.product.photos.full", { max: MAX_PHOTOS })}
          </p>
        )}
      </div>
      {rejected.length > 0 && (
        <ul className="mt-2 grid gap-1" role="alert">
          {rejected.map((file, i) => (
            <li key={`${file.name}-${i}`} className="inline-flex items-start gap-1 text-sm font-semibold text-destructive">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t(`admin.product.photos.rejected.${file.problem}`, { name: file.name, max: MAX_PHOTOS })}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id="photos-error" className="mt-2 font-semibold text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
