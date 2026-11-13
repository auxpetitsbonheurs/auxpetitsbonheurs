// Photo tiles of the custom cake form (E-08 S-152 AC6, AC8, AC10, AC11; S-153 AC6, AC9; S-154
// AC1, AC4, AC6). Every tile is a list item with its own buttons named by position ("Remove
// photo 2", "Try again photo 3"); progress and problems are announced politely; an error chip
// says what happened in words (never colour alone). Tiles reflow two per row on a 320 px phone.
import { ImagePlus, LoaderCircle, RotateCw, X } from "lucide-react";
import { useRef } from "react";
import { useI18n } from "~/i18n/react";
import { useHydrated } from "~/lib/use-hydrated";
import { cn } from "~/lib/utils";
import type { PhotoTile } from "./use-request-photos";

export interface PhotoPickerProps {
  tiles: PhotoTile[];
  status: string;
  problems: string[];
  full: boolean;
  error?: string;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

const tileBox = "relative flex aspect-square min-h-28 flex-col overflow-hidden rounded-lg border-2 border-input bg-card";
const iconButton = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md bg-card px-2 text-sm font-semibold text-foreground shadow-sm outline-offset-2";

function TileState({ tile, n }: { tile: PhotoTile; n: number }) {
  const { t } = useI18n();
  if (tile.status === "shrinking" || tile.status === "uploading") {
    const text = tile.status === "shrinking" ? t("customRequest.photos.shrinking", { n }) : t("customRequest.photos.uploading", { n });
    return (
      <p className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-card/95 p-2 text-sm">
        <LoaderCircle aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
        <span className="min-w-0 wrap-anywhere">{text}</span>
      </p>
    );
  }
  return null;
}

function Tile({ tile, n, onRemove, onRetry }: { tile: PhotoTile; n: number; onRemove: (key: string) => void; onRetry: (key: string) => void }) {
  const { t } = useI18n();
  const alt = tile.galleryId ? t("customRequest.photos.galleryAlt", { n }) : t("customRequest.photos.alt", { n });
  return (
    <li className={cn(tileBox, tile.status === "failed" && "border-destructive")} data-status={tile.status}>
      {tile.previewUrl ? <img src={tile.previewUrl} alt={alt} className="h-full w-full object-cover" /> : <span className="sr-only">{alt}</span>}
      <TileState tile={tile} n={n} />
      {tile.status === "failed" && (
        <div className="absolute inset-x-0 bottom-0 grid gap-1 bg-card p-2">
          <p className="text-sm font-semibold text-destructive">{t("customRequest.photos.failed")}</p>
          <button type="button" className={cn(iconButton, "border-2 border-input")} onClick={() => onRetry(tile.key)}>
            <RotateCw aria-hidden="true" className="size-4" />
            <span className="sr-only">{t("customRequest.photos.retry", { n })}</span>
          </button>
        </div>
      )}
      <button type="button" className={cn(iconButton, "absolute end-1 top-1 border-2 border-input")} onClick={() => onRemove(tile.key)}>
        <X aria-hidden="true" className="size-5" />
        <span className="sr-only">{t("customRequest.photos.remove", { n })}</span>
      </button>
    </li>
  );
}

export function PhotoPicker({ tiles, status, problems, full, error, onAdd, onRemove, onRetry }: PhotoPickerProps) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const input = useRef<HTMLInputElement>(null);
  const addLabel = tiles.length === 0 ? t("customRequest.photos.add") : t("customRequest.photos.addMore", { count: tiles.length });
  return (
    <div id="photos" tabIndex={-1} className="mt-4 rounded-md outline-offset-4"aria-describedby={error ? "photos-error" : "photos-hint"}>
      <p id="photos-hint" className="max-w-measure text-sm text-muted-foreground">
        {t("customRequest.photos.hint")}
      </p>
      {error && (
        <p id="photos-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
      {tiles.map((tile) =>
        tile.galleryId ? <input key={tile.key} type="hidden" name="galleryPhotoId" value={tile.galleryId} /> : tile.path ? <input key={tile.key} type="hidden" name="photoPaths" value={tile.path} /> : null,
      )}
      <ul className="mt-3 grid grid-cols-2 gap-3 min-[30rem]:grid-cols-3" aria-label={t("customRequest.sections.photos")}>
        {tiles.map((tile, i) => (
          <Tile key={tile.key} tile={tile} n={i + 1} onRemove={onRemove} onRetry={onRetry} />
        ))}
        {hydrated && !full && (
          <li className="min-h-28">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex aspect-square min-h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-card p-2 text-center font-semibold outline-offset-2"
            >
              <ImagePlus aria-hidden="true" className="size-6" />
              <span className="wrap-anywhere">{addLabel}</span>
            </button>
          </li>
        )}
      </ul>
      {full && hydrated && <p className="mt-2 text-sm">{t("customRequest.photos.max")}</p>}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (files.length > 0) onAdd(files);
        }}
      />
      {problems.length > 0 && (
        <ul className="mt-3 grid gap-1 rounded-card border-2 border-destructive bg-card p-3" aria-label={t("customRequest.errors.photos")}>
          {problems.map((problem, i) => (
            <li key={i} className="font-semibold wrap-anywhere">
              {problem}
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {[status, ...problems].filter(Boolean).join(". ")}
      </p>
    </div>
  );
}
