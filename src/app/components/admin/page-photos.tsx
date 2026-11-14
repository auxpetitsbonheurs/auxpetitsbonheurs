// Brand page photos in the admin Pages editor (E-13 S-247): the S-047 upload queue
// (`usePhotoUploads`: browser compression, signed URL, Retry) with the page's own limit and
// upload prefix, plus an alt text per photo (English required, French optional), Move up /
// Move down buttons and Remove with a confirm. Posted with the page's Save in display order.
import { ChevronDown, ChevronUp, ImagePlus, LoaderCircle, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { Button } from "~/components/ui/button";
import { PHOTO_ALT_MAX } from "~/domain/site-pages";
import { useI18n } from "~/i18n/react";
import type { PagePhotoUploads } from "./use-page-photo-uploads";
import type { PhotoItem, RejectedFile } from "./use-photo-uploads";

export type AltTexts = Record<string, { en: string; fr: string }>;

/** Camera roll, camera and files; HEIC is listed so iPhones offer their photos as they are. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const inputClass = "mt-1 block min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive";

function Progress({ item }: { item: PhotoItem }) {
  const { t } = useI18n();
  if (item.state !== "preparing" && item.state !== "uploading") return null;
  const percent = item.state === "uploading" && item.progress !== null ? Math.round(item.progress * 100) : null;
  return (
    <span className="grid gap-1 text-sm">
      <span className="inline-flex items-center gap-1">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        {item.state === "preparing" ? t("admin.product.photos.preparing") : percent === null ? t("admin.product.photos.uploading") : t("admin.product.photos.uploadingPercent", { percent })}
      </span>
      {percent !== null && <progress max={100} value={percent} aria-label={t("admin.product.photos.progressLabel", { name: item.fileName })} className="h-2 w-full max-w-40 accent-primary" />}
    </span>
  );
}

interface RowProps {
  item: PhotoItem;
  index: number;
  count: number;
  /** Form name prefix while the photo is stored (`photos.<n>`, `eventPhoto`); null while not. */
  name: string | null;
  idPrefix: string;
  alt: { en: string; fr: string };
  errors: Record<string, string | undefined>;
  onAlt: (alt: { en: string; fr: string }) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onRetry: () => void;
  single: boolean;
}

function AltFields({ item, index, name, idPrefix, alt, errors, onAlt }: Pick<RowProps, "item" | "index" | "name" | "idPrefix" | "alt" | "errors" | "onAlt">) {
  const { t } = useI18n();
  const id = `${idPrefix}-${index}-alt`;
  const enError = name ? (errors[`${name}.alt.en`] ?? errors[name]) : undefined;
  const frError = name ? errors[`${name}.alt.fr`] : undefined;
  const label = t("admin.pages.photos.alt", { n: index + 1 });
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={`${id}-en`} className="block font-semibold">
          {t("admin.settings.inEnglish", { label })}
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {t("admin.pages.photos.altHint")}
        </p>
        <input id={`${id}-en`} name={name ? `${name}.alt.en` : undefined} value={alt.en} maxLength={PHOTO_ALT_MAX} autoComplete="off" aria-invalid={enError ? true : undefined} aria-describedby={`${id}-hint${enError ? ` ${id}-en-error` : ""}`} onChange={(e) => onAlt({ ...alt, en: e.currentTarget.value })} className={inputClass} data-photo-key={item.key} />
        {enError && (
          <p id={`${id}-en-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
            {enError}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-fr`} className="block font-semibold">
          {t("admin.settings.inFrench", { label })}
        </label>
        <p id={`${id}-fr-hint`} className="text-sm text-muted-foreground">
          {t("admin.pages.frEmpty")}
        </p>
        <input id={`${id}-fr`} name={name ? `${name}.alt.fr` : undefined} value={alt.fr} maxLength={PHOTO_ALT_MAX} autoComplete="off" aria-invalid={frError ? true : undefined} aria-describedby={`${id}-fr-hint${frError ? ` ${id}-fr-error` : ""}`} onChange={(e) => onAlt({ ...alt, fr: e.currentTarget.value })} className={inputClass} />
        {frError && (
          <p id={`${id}-fr-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
            {frError}
          </p>
        )}
      </div>
    </div>
  );
}

function PhotoRow(props: RowProps) {
  const { t } = useI18n();
  const { item, index, count, name, onMove, onRemove, onRetry, single } = props;
  const [confirming, setConfirming] = useState(false);
  const n = index + 1;
  const retryable = item.state === "failed" && item.failure !== "heic" && item.failure !== "unreadable" && item.failure !== "too_big_after";
  return (
    <li data-state={item.state} className="grid min-w-0 gap-3 rounded-md border-2 border-input bg-card p-2 data-[state=failed]:border-destructive sm:p-3">
      {name && (
        <>
          <input type="hidden" name={`${name}.path`} value={item.path ?? ""} />
          <input type="hidden" name={`${name}.width`} value={item.width} />
          <input type="hidden" name={`${name}.height`} value={item.height} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-decorative">
          {/* The description is in the fields beside it: the thumbnail itself is decorative here. */}
          {item.url && <img src={item.url} alt="" width={80} height={80} className="size-20 object-cover" />}
        </span>
        <div className="min-w-0 flex-[1_1_8rem]">
          <p className="font-semibold">{t("admin.product.photos.photoN", { n })}</p>
          <Progress item={item} />
          {item.state === "failed" && (
            <p className="inline-flex items-start gap-1 text-sm font-semibold text-destructive">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t(`admin.product.photos.failed.${item.failure ?? "network"}`)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {retryable && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry} aria-label={t("admin.product.photos.retryN", { n })}>
              <RefreshCw aria-hidden="true" />
              {t("admin.product.photos.retry")}
            </Button>
          )}
          {!single && (
            <>
              <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={t("admin.product.photos.moveEarlier", { n })}>
                <ChevronUp aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={t("admin.product.photos.moveLater", { n })}>
                <ChevronDown aria-hidden="true" />
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" size="icon" aria-expanded={confirming} onClick={() => setConfirming(true)} aria-label={t("admin.product.photos.removeN", { n })}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      {confirming && (
        <div role="group" aria-label={t("admin.pages.photos.removeTitle", { n })} className="rounded-md border border-destructive p-3">
          <p className="font-semibold">{t("admin.pages.photos.removeTitle", { n })}</p>
          <p className="text-sm">{t("admin.pages.photos.removeBody")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="border-destructive" onClick={onRemove}>
              {t("admin.pages.photos.remove")}
            </Button>
            <Button type="button" onClick={() => setConfirming(false)} autoFocus>
              {t("admin.pages.photos.keep")}
            </Button>
          </div>
        </div>
      )}
      <AltFields {...props} />
    </li>
  );
}

export interface PagePhotosProps {
  id: string;
  legend: string;
  hint: string;
  max: number;
  photos: PagePhotoUploads;
  alts: AltTexts;
  setAlt: (key: string, alt: { en: string; fr: string }) => void;
  errors: Record<string, string | undefined>;
  onChange: () => void;
  announce: (text: string) => void;
}

/** Form names in display order: only stored photos are posted, numbered from 0 without gaps. */
function postedNames(items: PhotoItem[]): (string | null)[] {
  let n = 0;
  return items.map((item) => {
    if (item.state !== "ready" || !item.path) return null;
    return `photos.${n++}`;
  });
}

export function PagePhotos({ id, legend, hint, max, photos, alts, setAlt, errors, onChange, announce }: PagePhotosProps) {
  const { t } = useI18n();
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const { items } = photos;
  const full = items.length >= max;
  const names = postedNames(items);
  const groupError = errors.photos;

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (files.length === 0) return;
    const refused = photos.add(files, max - items.length);
    setRejected(refused);
    if (files.length > refused.length) onChange();
  };

  return (
    <fieldset id={id} tabIndex={-1} aria-describedby={`${id}-hint`} className="min-w-0 outline-offset-2">
      <legend className="mb-1 text-lg font-semibold">{legend}</legend>
      <p id={`${id}-hint`} className="max-w-measure text-sm text-muted-foreground">
        {hint}
      </p>
      {items.length > 0 && (
        <ol className="mt-3 grid gap-2" aria-label={legend}>
          {items.map((item, index) => (
            <PhotoRow
              key={item.key}
              item={item}
              index={index}
              count={items.length}
              name={names[index] ?? null}
              idPrefix={id}
              alt={alts[item.key] ?? { en: "", fr: "" }}
              errors={errors}
              single={max === 1}
              onAlt={(alt) => {
                setAlt(item.key, alt);
                onChange();
              }}
              onMove={(to) => {
                photos.move(index, to);
                onChange();
                announce(t("admin.product.photos.announceMoved", { n: to + 1, count: items.length }));
              }}
              onRemove={() => {
                photos.remove(item.key);
                onChange();
                announce(t("admin.pages.photos.announceRemoved", { n: index + 1, count: items.length - 1 }));
                document.getElementById(`${id}-add`)?.focus();
              }}
              onRetry={() => photos.retry(item.key)}
            />
          ))}
        </ol>
      )}
      <div className="mt-3">
        {/* A real file input inside the label: one 48 px target, opens camera or gallery on phones. */}
        <label className={`relative inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-input bg-card px-4 py-2 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring ${full ? "opacity-60" : "cursor-pointer hover:bg-accent"}`}>
          <ImagePlus aria-hidden="true" className="size-5" />
          {t("admin.product.photos.add")}
          <input id={`${id}-add`} type="file" accept={ACCEPT} multiple={max > 1} disabled={full} aria-describedby={full ? `${id}-full` : `${id}-hint`} onChange={choose} className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed" />
        </label>
        {full && max > 1 && (
          <p id={`${id}-full`} className="mt-1 text-sm font-semibold">
            {t("admin.pages.photos.full", { max })}
          </p>
        )}
      </div>
      {rejected.length > 0 && (
        <ul className="mt-2 grid gap-1" role="alert">
          {rejected.map((file, i) => (
            <li key={`${file.name}-${i}`} className="inline-flex items-start gap-1 text-sm font-semibold text-destructive">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {file.problem === "full" ? t("admin.pages.photos.rejectedFull", { name: file.name, max }) : t(`admin.product.photos.rejected.${file.problem}`, { name: file.name })}
            </li>
          ))}
        </ul>
      )}
      {groupError && (
        <p className="mt-2 font-semibold text-destructive" id={`${id}-error`}>
          {groupError}
        </p>
      )}
    </fieldset>
  );
}
