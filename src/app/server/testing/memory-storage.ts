// An in-memory Supabase Storage double for the menu seed (S-241): signed uploads, PUTs,
// read-back checks and removals, with no network.
import type { MenuPhotoUploads } from "~/server/services/menu-photos.server";
import { HEAD_BYTES, type StorageGateway } from "~/server/storage.server";

export class MemoryStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  readonly removed: string[] = [];
  signed = 0;

  get gateway(): MenuPhotoUploads & StorageGateway {
    return {
      signUpload: async (bucket, path) => {
        this.signed += 1;
        return { path, signedUrl: `https://storage.test/upload/${bucket}/${path}?token=t`, token: "t" };
      },
      put: async (signedUrl, bytes, contentType) => {
        const key = new URL(signedUrl).pathname.replace(/^\/upload\//, "");
        if (this.objects.has(key)) throw new Error("storage upload answered 409");
        this.objects.set(key, { bytes, contentType });
      },
      inspect: async (bucket, path) => {
        const object = this.objects.get(`${bucket}/${path}`);
        return object ? { size: object.bytes.length, contentType: object.contentType, head: object.bytes.slice(0, HEAD_BYTES) } : null;
      },
      remove: async (bucket, paths) => {
        for (const path of paths) {
          this.objects.delete(`${bucket}/${path}`);
          this.removed.push(path);
        }
      },
    };
  }
}
