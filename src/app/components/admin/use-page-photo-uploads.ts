// Photo list of a brand page while it is edited (E-13 S-247). Same rules and the same upload
// path as product photos (S-047): checked by `sourceProblem`, compressed in the browser by
// `compressPhoto` (loaded on the first photo), signed by `requestUpload` under the page's
// prefix and sent by `putFile`. A failed photo keeps its place with Retry; the others go on.
//
// Why not `usePhotoUploads`: sharing that module with this route would split it out of the
// product editor's chunk and push that route over its 170 kB JS budget (169.5 kB today), so
// this small queue lives here and the upload code under it is shared.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sourceProblem } from "~/domain/upload";
import type { PreparedPhoto } from "~/lib/image-compress";
import { UploadError, type UploadScopeName, putFile, requestUpload } from "~/lib/photo-upload";
import type { PhotoFailure, PhotoItem, RejectedFile, SavedPhoto } from "./use-photo-uploads";

const PROGRESS_AFTER_MS = 1000;

const fromSaved = (photo: SavedPhoto): PhotoItem => ({ key: photo.path, path: photo.path, url: photo.url, width: photo.width, height: photo.height, state: "ready", progress: null, failure: null, fileName: "" });

export function usePagePhotoUploads(saved: readonly SavedPhoto[], max: number, scope: UploadScopeName, announce: (key: string, values: Record<string, string>) => void) {
  const [items, setItems] = useState<PhotoItem[]>(() => saved.map(fromSaved));
  const session = useRef<string | null>(null);
  const sources = useRef(new Map<string, { file: File; compressed?: PreparedPhoto }>());
  const urls = useRef(new Set<string>());
  // One upload at a time: a page has at most six photos, and a phone's uplink is the limit.
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
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
          urls.current.add(url);
          patch(key, { url, width: source.compressed.width, height: source.compressed.height });
        }
        const photo = source.compressed;
        patch(key, { state: "uploading" });
        let fraction = 0;
        let shown = false;
        timer = setTimeout(() => {
          shown = true;
          patch(key, { progress: fraction });
        }, PROGRESS_AFTER_MS);
        session.current ??= crypto.randomUUID();
        const issued = await requestUpload(session.current, photo.type, photo.blob.size, undefined, scope);
        await putFile(issued.signedUrl, photo.blob, (value) => {
          fraction = value;
          if (shown) patch(key, { progress: value });
        });
        // Smaller copies for phones (S-276): best effort, the save finds them by name.
        await lazy.uploadVariants(session.current, scope, { path: issued.path, type: photo.type }, photo.variants);
        patch(key, { state: "ready", path: issued.path, progress: null });
        announce("admin.product.photos.announceUploaded", { name: source.file.name });
      } catch (error) {
        const failure: PhotoFailure = error instanceof UploadError ? error.failure : ((error as { problem?: PhotoFailure }).problem ?? "unreadable");
        patch(key, { state: "failed", failure, progress: null });
        announce("admin.product.photos.announceFailed", { name: source.file.name });
      } finally {
        clearTimeout(timer);
      }
    },
    [patch, announce, scope],
  );

  const enqueue = useCallback(
    (key: string) => {
      patch(key, { state: "preparing", failure: null });
      chain.current = chain.current.then(() => upload(key));
    },
    [patch, upload],
  );

  /** Adds chosen files; returns those refused before anything was sent (S-247 AC2). */
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
        setItems((list) => [...list, ...accepted].slice(0, max));
        for (const item of accepted) chain.current = chain.current.then(() => upload(item.key));
      }
      return rejected;
    },
    [max, upload],
  );

  const remove = useCallback((key: string) => {
    sources.current.delete(key);
    setItems((list) => list.filter((item) => item.key !== key));
  }, []);
  const move = useCallback(
    (from: number, to: number) =>
      setItems((list) => {
        const next = [...list];
        const [item] = next.splice(from, 1);
        if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
        return next;
      }),
    [],
  );
  /** After a save: keep what the server now has (keys stay stable). */
  const settle = useCallback(() => setItems((list) => list.filter((item) => item.state === "ready")), []);

  const summary = useMemo(() => ({ busy: items.some((i) => i.state === "preparing" || i.state === "uploading"), failed: items.filter((i) => i.state === "failed").length }), [items]);

  return { items, add, retry: enqueue, remove, move, settle, summary, sessionId: () => session.current };
}

export type PagePhotoUploads = ReturnType<typeof usePagePhotoUploads>;
