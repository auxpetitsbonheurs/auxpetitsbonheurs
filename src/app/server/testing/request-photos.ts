// An in-memory private bucket for E-08 tests: signed uploads, "uploaded" objects put by the
// test, read-back checks and signed read URLs. No network.
import { HEAD_BYTES, type RequestPhotoGateway } from "~/server/storage.server";

/** First bytes of a real WebP / JPEG and of a PDF, padded to a plausible size. */
export const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, ...new Array(200).fill(1)]);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(2)]);
export const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, ...new Array(200).fill(3)]);

export class MemoryRequestPhotos {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  readonly signedReads: { path: string; seconds: number }[] = [];
  signed = 0;
  failSigning = false;

  /** Stores an object as if the browser had PUT it to its signed URL. */
  put(path: string, bytes: Uint8Array = WEBP_BYTES, contentType = "image/webp", bucket = "request-photos") {
    this.objects.set(`${bucket}/${path}`, { bytes, contentType });
  }

  get gateway(): RequestPhotoGateway {
    return {
      signUpload: async (bucket, path) => {
        if (this.failSigning) throw new Error("storage sign answered 500");
        this.signed += 1;
        return { path, signedUrl: `https://storage.test/upload/${bucket}/${path}?token=t`, token: "t" };
      },
      inspect: async (bucket, path) => {
        const object = this.objects.get(`${bucket}/${path}`);
        return object ? { size: object.bytes.length, contentType: object.contentType, head: object.bytes.slice(0, HEAD_BYTES) } : null;
      },
      signRead: async (bucket, path, seconds) => {
        this.signedReads.push({ path, seconds });
        return `https://storage.test/sign/${bucket}/${path}?token=read`;
      },
    };
  }
}
