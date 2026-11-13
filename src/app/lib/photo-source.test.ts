// S-152 AC3: a file is judged by its signature, not its name or declared type.
import { describe, expect, test } from "vitest";
import { hasPhotoSignature, isPhotoSignature } from "./photo-source";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("isPhotoSignature (S-152 AC3)", () => {
  test("JPEG, PNG and WebP by magic number", () => {
    expect(isPhotoSignature(bytes([0xff, 0xd8, 0xff, 0xe1], [0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(isPhotoSignature(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isPhotoSignature(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe(true);
  });

  test("HEIC and HEIF by their ftyp brand", () => {
    expect(isPhotoSignature(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0]))).toBe(true);
    expect(isPhotoSignature(bytes([0, 0, 0, 0x18], "ftypmif1", [0, 0, 0, 0]))).toBe(true);
  });

  test("a PDF, an MP4 or a GIF is not a photo we take", () => {
    expect(isPhotoSignature(bytes("%PDF-1.7", [0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isPhotoSignature(bytes([0, 0, 0, 0x18], "ftypisom", [0, 0, 0, 0]))).toBe(false);
    expect(isPhotoSignature(bytes("GIF89a", [0, 0, 0, 0, 0, 0]))).toBe(false);
  });

  test("a PDF renamed to .jpg with an image type is still refused", async () => {
    const renamed = new File([bytes("%PDF-1.4 fake")], "cake.jpg", { type: "image/jpeg" });
    expect(await hasPhotoSignature(renamed)).toBe(false);
  });
});
