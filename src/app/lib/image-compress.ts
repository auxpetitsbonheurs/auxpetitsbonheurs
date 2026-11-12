// Browser-side photo preparation (S-047 AC1, AC2, AC8; FR-029, NFR-001, NFR-009). Loaded
// with a dynamic import when the first photo is chosen, never with the editor route.
// A photo is decoded (HEIC through a lazily loaded decoder when the browser cannot read it),
// scaled to at most 1600 px on the long edge and re-encoded as WebP (JPEG where the browser
// cannot write WebP) at decreasing quality until it fits 300 kB. Drawing to a canvas and
// encoding again keeps only pixels: EXIF (location, camera, time) never leaves the phone.
import {
  PHOTO_MAX_EDGE,
  type SourceProblem,
  UPLOAD_MAX_BYTES,
  UPLOAD_TARGET_BYTES,
  type UploadType,
  fitWithin,
  isHeicSource,
  sourceProblem,
} from "~/domain/upload";

export type CompressProblem = SourceProblem | "unreadable" | "heic" | "too_big_after";

export class CompressError extends Error {
  constructor(readonly problem: CompressProblem) {
    super(`photo not usable: ${problem}`);
  }
}

export interface DecodedImage {
  width: number;
  height: number;
  close(): void;
}

export interface CompressIo {
  /** The browser's own decoder (createImageBitmap); throws when it cannot read the file. */
  decode(file: Blob): Promise<DecodedImage>;
  /** HEIC/HEIF decoder for browsers without native support (loaded on demand). */
  decodeHeic(file: Blob): Promise<DecodedImage>;
  /** Draws `image` at `width` x `height` and encodes it; the Blob's type is what the browser really wrote. */
  encode(image: DecodedImage, width: number, height: number, type: UploadType, quality: number): Promise<Blob>;
}

export interface CompressedPhoto {
  blob: Blob;
  type: UploadType;
  width: number;
  height: number;
}

const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42];
const SCALES = [1, 0.8, 0.64, 0.5];

async function decodeSource(file: File, io: CompressIo): Promise<DecodedImage> {
  if (isHeicSource(file)) {
    try {
      return await io.decode(file); // Safari reads HEIC natively
    } catch {
      return io.decodeHeic(file).catch(() => {
        throw new CompressError("heic");
      });
    }
  }
  return io.decode(file).catch(() => {
    throw new CompressError("unreadable");
  });
}

/** Encodes as `type`; falls back to JPEG when the browser silently writes something else (old Safari: PNG). */
async function encodeAs(io: CompressIo, image: DecodedImage, size: { width: number; height: number }, type: UploadType, quality: number) {
  const blob = await io.encode(image, size.width, size.height, type, quality);
  if (blob.type === type) return { blob, type };
  const jpeg = await io.encode(image, size.width, size.height, "image/jpeg", quality);
  return { blob: jpeg, type: "image/jpeg" as const };
}

async function shrink(io: CompressIo, image: DecodedImage): Promise<CompressedPhoto> {
  const fitted = fitWithin(image.width, image.height, PHOTO_MAX_EDGE);
  let type: UploadType = "image/webp";
  let smallest: CompressedPhoto | null = null;
  for (const scale of SCALES) {
    const size = fitWithin(fitted.width, fitted.height, Math.round(Math.max(fitted.width, fitted.height) * scale));
    for (const quality of QUALITIES) {
      const encoded = await encodeAs(io, image, size, type, quality);
      type = encoded.type;
      const photo = { blob: encoded.blob, type, ...size };
      if (!smallest || photo.blob.size < smallest.blob.size) smallest = photo;
      if (photo.blob.size <= UPLOAD_TARGET_BYTES) return photo;
    }
  }
  if (smallest && smallest.blob.size <= UPLOAD_MAX_BYTES) return smallest;
  throw new CompressError("too_big_after");
}

/** The file to upload for `file`, or a CompressError saying why it cannot be used. */
export async function compressPhoto(file: File, io: CompressIo = browserIo()): Promise<CompressedPhoto> {
  const problem = sourceProblem(file);
  if (problem) throw new CompressError(problem);
  const image = await decodeSource(file, io);
  try {
    return await shrink(io, image);
  } finally {
    image.close();
  }
}

// ---------------------------------------------------------------------------
// The real browser implementation.

function bitmapImage(bitmap: ImageBitmap): DecodedImage & { bitmap: ImageBitmap } {
  return { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}

function canvasBlob(width: number, height: number, draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void, type: string, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.reject(new Error("no 2d context"));
    draw(ctx);
    return canvas.convertToBlob({ type, quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no 2d context"));
  draw(ctx);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), type, quality));
}

export function browserIo(): CompressIo {
  return {
    decode: async (file) => bitmapImage(await createImageBitmap(file, { imageOrientation: "from-image" })),
    decodeHeic: async (file) => {
      const { heicTo } = await import("heic-to");
      return bitmapImage(await heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } }));
    },
    encode: (image, width, height, type, quality) =>
      canvasBlob(
        width,
        height,
        (ctx) => {
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage((image as ReturnType<typeof bitmapImage>).bitmap, 0, 0, width, height);
        },
        type,
        quality,
      ),
  };
}
