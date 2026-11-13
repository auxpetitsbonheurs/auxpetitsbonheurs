// The custom cake form's photos (E-08 S-152, S-153, S-154). Each chosen file is checked (type by
// signature, 10 MB), shrunk on the phone by the shared compressor (loaded on the first pick, never
// in the route's initial JavaScript), then uploaded straight to the private bucket with a signed
// URL. A failed upload keeps its shrunk file for "Try again"; uploaded tiles keep their path, so a
// retry after a network drop re-uses them (S-153 AC6). A gallery photo pre-attached from
// "Request something similar" is tile 1 and counts toward the 5 (S-154).
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PHOTOS, sourceProblem } from "~/domain/upload";
import { useI18n } from "~/i18n/react";
import { hasPhotoSignature } from "~/lib/photo-source";

export type TileStatus = "shrinking" | "uploading" | "done" | "failed";

export interface PhotoTile {
  key: string;
  status: TileStatus;
  previewUrl: string | null;
  /** Stored path once uploaded (posted as `photoPaths`). */
  path?: string;
  /** The gallery photo this tile references (posted as `galleryPhotoId`). */
  galleryId?: string;
  blob?: Blob;
  type?: string;
  progress?: number;
}

export interface GalleryAttachment {
  id: string;
  url: string;
}

type Upload = (blob: Blob, type: string, onProgress: (fraction: number) => void) => Promise<string>;

let nextKey = 0;
const newKey = () => `p${(nextKey += 1)}`;

type Compress = typeof import("~/lib/image-compress");
let compressor: Promise<Compress> | null = null;
const loadCompressor = () => (compressor ??= import("~/lib/image-compress"));

const MESSAGE_FOR: Record<string, string> = {
  type: "customRequest.photos.type",
  too_big: "customRequest.photos.tooBig",
  too_big_after: "customRequest.photos.tooDetailed",
  heic: "customRequest.photos.unreadable",
  unreadable: "customRequest.photos.unreadable",
};

export function useRequestPhotos(gallery: GalleryAttachment | null, upload: Upload) {
  const { t } = useI18n();
  const [tiles, setTiles] = useState<PhotoTile[]>(() => (gallery ? [{ key: "gallery", status: "done", previewUrl: gallery.url, galleryId: gallery.id }] : []));
  /** Polite progress line (role=status). */
  const [status, setStatus] = useState("");
  /** Why chosen files were not added; stays until the next pick. */
  const [problems, setProblems] = useState<string[]>([]);
  const tilesRef = useRef(tiles);
  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  const patch = useCallback((key: string, change: Partial<PhotoTile>) => setTiles((all) => all.map((tile) => (tile.key === key ? { ...tile, ...change } : tile))), []);
  const position = (key: string) => tilesRef.current.findIndex((tile) => tile.key === key) + 1;

  const send = useCallback(
    async (key: string, blob: Blob, type: string) => {
      patch(key, { status: "uploading", progress: 0 });
      setStatus(t("customRequest.photos.uploading", { n: position(key) }));
      try {
        const path = await upload(blob, type, (progress) => patch(key, { progress }));
        patch(key, { status: "done", path, blob: undefined });
        setStatus(t("customRequest.photos.uploaded", { n: position(key) }));
      } catch {
        patch(key, { status: "failed" });
        setStatus(t("customRequest.photos.failedN", { n: position(key) }));
      }
    },
    [patch, t, upload],
  );

  const prepare = useCallback(
    async (file: File, key: string) => {
      try {
        const { compressPhoto } = await loadCompressor();
        const photo = await compressPhoto(file, undefined, { variants: false });
        patch(key, { previewUrl: URL.createObjectURL(photo.blob), blob: photo.blob, type: photo.type });
        await send(key, photo.blob, photo.type);
      } catch (error) {
        const problem = (error as { problem?: string }).problem ?? "unreadable";
        setTiles((all) => all.filter((tile) => tile.key !== key));
        setProblems((list) => [...list, t(MESSAGE_FOR[problem] ?? MESSAGE_FOR.unreadable!, { name: file.name })]);
      }
    },
    [patch, send, t],
  );

  /** Files the picker gave: checked, capped at 5 in all, then shrunk and uploaded one by one. */
  const add = useCallback(
    async (files: File[]) => {
      const found: string[] = [];
      const usable: File[] = [];
      for (const file of files) {
        const problem = sourceProblem(file) ?? ((await hasPhotoSignature(file)) ? null : "type");
        if (problem) found.push(t(MESSAGE_FOR[problem]!, { name: file.name }));
        else usable.push(file);
      }
      const room = MAX_PHOTOS - tilesRef.current.length;
      if (usable.length > room) found.push(t("customRequest.photos.max"));
      const accepted = usable.slice(0, Math.max(0, room)).map((file) => ({ file, key: newKey() }));
      setProblems(found);
      if (accepted.length === 0) return;
      setTiles((all) => [...all, ...accepted.map(({ key }) => ({ key, status: "shrinking" as const, previewUrl: null }))]);
      setStatus(t("customRequest.photos.shrinking", { n: tilesRef.current.length + 1 }));
      for (const { file, key } of accepted) await prepare(file, key);
    },
    [prepare, t],
  );

  const remove = useCallback(
    (key: string) => {
      setTiles((all) => all.filter((tile) => tile.key !== key));
      setStatus(t("customRequest.photos.removed"));
    },
    [t],
  );

  const retry = useCallback(
    (key: string) => {
      const tile = tilesRef.current.find((item) => item.key === key);
      if (tile?.blob && tile.type) void send(key, tile.blob, tile.type);
    },
    [send],
  );

  // Object URLs of shrunk photos are released when the page goes away.
  useEffect(() => () => tilesRef.current.forEach((tile) => tile.previewUrl?.startsWith("blob:") && URL.revokeObjectURL(tile.previewUrl)), []);

  const busy = tiles.some((tile) => tile.status !== "done");
  return { tiles, status, problems, add, remove, retry, busy, full: tiles.length >= MAX_PHOTOS };
}
