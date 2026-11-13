// The editor's photo list while it is being edited (S-047 AC1-AC6). Each new photo is
// checked, compressed (code loaded on the first photo), given a signed URL and uploaded,
// at most three at a time. A failed one keeps its place with Retry; the others go on.
// Nothing here touches the saved product: the list is posted with Save.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_PHOTOS, sourceProblem } from "~/domain/upload";
import type { PreparedPhoto } from "~/lib/image-compress";
import { UploadError, putFile, requestUpload } from "~/lib/photo-upload";
import { moveItem } from "~/lib/use-drag-sort";

export type PhotoState = "ready" | "preparing" | "uploading" | "failed";
/** Why a photo failed: the editor turns it into a sentence. */
export type PhotoFailure = "heic" | "unreadable" | "too_big_after" | "signed_out" | "refused" | "network";

export interface PhotoItem {
  key: string;
  /** Storage path once stored (saved or uploaded in this session). */
  path: string | null;
  /** What the tile shows: the CDN URL, or the compressed file in this browser. */
  url: string | null;
  width: number;
  height: number;
  state: PhotoState;
  /** 0..1, shown only once an upload has taken longer than a second. */
  progress: number | null;
  failure: PhotoFailure | null;
  fileName: string;
}

export interface SavedPhoto {
  path: string;
  url: string;
  width: number;
  height: number;
}

export type RejectedFile = { name: string; problem: "type" | "too_big" | "full" };

export const UPLOAD_CONCURRENCY = 3;
const PROGRESS_AFTER_MS = 1000;

const fromSaved = (photo: SavedPhoto): PhotoItem => ({ key: photo.path, path: photo.path, url: photo.url, width: photo.width, height: photo.height, state: "ready", progress: null, failure: null, fileName: "" });

function newSessionId(): string {
  return crypto.randomUUID();
}

export function usePhotoUploads(saved: readonly SavedPhoto[], announce: (message: { key: string; values?: Record<string, string | number> }) => void) {
  const [items, setItems] = useState<PhotoItem[]>(() => saved.map(fromSaved));
  const sessionId = useRef<string | null>(null);
  const sources = useRef(new Map<string, { file: File; compressed?: PreparedPhoto }>());
  const queue = useRef<string[]>([]);
  const active = useRef(0);
  const objectUrls = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const patch = useCallback((key: string, change: Partial<PhotoItem>) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item))), []);

  const upload = useCallback(
    async (key: string) => {
      const source = sources.current.get(key);
      if (!source) return;
      patch(key, { state: "preparing", failure: null, progress: null });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const lazy = await import("~/lib/image-compress");
        if (!source.compressed) {
          source.compressed = await lazy.compressPhoto(source.file);
          const url = URL.createObjectURL(source.compressed.blob);
          objectUrls.current.add(url);
          patch(key, { url, width: source.compressed.width, height: source.compressed.height });
        }
        const photo = source.compressed;
        patch(key, { state: "uploading" });
        let fraction = 0;
        timer = setTimeout(() => patch(key, { progress: fraction }), PROGRESS_AFTER_MS);
        sessionId.current ??= newSessionId();
        const issued = await requestUpload(sessionId.current, photo.type, photo.blob.size);
        await putFile(issued.signedUrl, photo.blob, (value) => {
          fraction = value;
          setItems((list) => list.map((item) => (item.key === key && item.progress !== null ? { ...item, progress: value } : item)));
        });
        // Smaller copies for phones (S-276): best effort, the save finds them by name.
        await lazy.uploadVariants(sessionId.current, "products", { path: issued.path, type: photo.type }, photo.variants);
        patch(key, { state: "ready", path: issued.path, progress: null });
        announce({ key: "admin.product.photos.announceUploaded", values: { name: source.file.name } });
      } catch (error) {
        const failure: PhotoFailure = error instanceof UploadError ? error.failure : ((error as { problem?: PhotoFailure }).problem ?? "unreadable");
        patch(key, { state: "failed", failure, progress: null });
        announce({ key: "admin.product.photos.announceFailed", values: { name: source.file.name } });
      } finally {
        clearTimeout(timer);
      }
    },
    [patch, announce],
  );

  const pump = useCallback(() => {
    const next = () => {
      while (active.current < UPLOAD_CONCURRENCY && queue.current.length > 0) {
        const key = queue.current.shift()!;
        active.current += 1;
        void upload(key).finally(() => {
          active.current -= 1;
          next();
        });
      }
    };
    next();
  }, [upload]);

  const enqueue = useCallback(
    (key: string) => {
      queue.current.push(key);
      pump();
    },
    [pump],
  );

  /** Adds chosen files; returns those refused before anything was sent (AC2, AC4). */
  const add = useCallback(
    (files: readonly File[], free: number): RejectedFile[] => {
      const rejected: RejectedFile[] = [];
      const accepted: PhotoItem[] = [];
      for (const file of files) {
        const problem = sourceProblem(file);
        if (problem) rejected.push({ name: file.name, problem });
        else if (accepted.length >= free) rejected.push({ name: file.name, problem: "full" });
        else {
          const key = `new-${crypto.randomUUID()}`;
          sources.current.set(key, { file });
          accepted.push({ key, path: null, url: null, width: 0, height: 0, state: "preparing", progress: null, failure: null, fileName: file.name });
        }
      }
      if (accepted.length > 0) {
        setItems((list) => [...list, ...accepted].slice(0, MAX_PHOTOS));
        for (const item of accepted) enqueue(item.key);
      }
      return rejected;
    },
    [enqueue],
  );

  const retry = useCallback((key: string) => enqueue(key), [enqueue]);
  const remove = useCallback((key: string) => {
    sources.current.delete(key);
    queue.current = queue.current.filter((k) => k !== key);
    setItems((list) => list.filter((item) => item.key !== key));
  }, []);
  const move = useCallback((from: number, to: number) => setItems((list) => moveItem(list, from, to)), []);
  /** After a save: the list as the server now has it (paths stay; keys stay stable). */
  const settle = useCallback(() => setItems((list) => list.filter((item) => item.state === "ready")), []);

  const summary = useMemo(
    () => ({
      busy: items.some((item) => item.state === "preparing" || item.state === "uploading"),
      failed: items.filter((item) => item.state === "failed").length,
      posted: items.filter((item) => item.state === "ready" && item.path).map((item) => ({ path: item.path!, width: item.width, height: item.height })),
    }),
    [items],
  );

  return { items, add, retry, remove, move, settle, summary, sessionId: () => sessionId.current };
}
