// S-047 AC1, AC2: photos are scaled, re-encoded and checked in the browser before upload.
// The decoder and encoder are doubles here (Node has no canvas); the real browser path is
// exercised end to end in tests/e2e/admin-menu.spec.ts with JPEG and HEIC fixtures.
import { describe, expect, test, vi } from "vitest";
import { UPLOAD_TARGET_BYTES, sniffImageType, sourceProblem } from "~/domain/upload";
import { CompressError, type CompressIo, compressPhoto } from "./image-compress";

const MB = 1_048_576;

function file(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(8)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

/** Encoder double: bytes shrink with pixels and quality; `webp: false` mimics a browser that writes PNG instead. */
function fakeIo(options: { width: number; height: number; native?: boolean; webp?: boolean; bytesPerPixel?: number }): CompressIo & { encodes: { width: number; height: number; type: string; quality: number }[] } {
  const encodes: { width: number; height: number; type: string; quality: number }[] = [];
  const image = { width: options.width, height: options.height, close: vi.fn() };
  return {
    encodes,
    decode: vi.fn(async () => {
      if (options.native === false) throw new Error("cannot decode");
      return image;
    }),
    decodeHeic: vi.fn(async () => image),
    encode: vi.fn(async (_img, width, height, type, quality) => {
      encodes.push({ width, height, type, quality });
      const written = type === "image/webp" && options.webp === false ? "image/png" : type;
      const size = Math.round(width * height * quality * (options.bytesPerPixel ?? 0.3));
      return new Blob([new Uint8Array(size)], { type: written });
    }),
  };
}

describe("compressPhoto (AC1)", () => {
  test("an 8 MB HEIC the browser cannot read is decoded by the HEIC decoder, scaled to 1600 px and kept under 300 kB as WebP", async () => {
    const io = fakeIo({ width: 4032, height: 3024, native: false });

    const photo = await compressPhoto(file("IMG_0001.HEIC", "image/heic", 8 * MB), io);

    expect(io.decodeHeic).toHaveBeenCalledTimes(1);
    expect(Math.max(photo.width, photo.height)).toBeLessThanOrEqual(1600);
    expect(photo.width / photo.height).toBeCloseTo(4032 / 3024, 2);
    expect(photo.blob.size).toBeLessThanOrEqual(UPLOAD_TARGET_BYTES);
    expect(photo.type).toBe("image/webp");
    expect(photo.blob.type).toBe("image/webp");
  });

  test("Safari reads HEIC natively: no extra decoder is loaded", async () => {
    const io = fakeIo({ width: 3024, height: 4032 });

    await compressPhoto(file("IMG_0002.heic", "", 5 * MB), io);

    expect(io.decode).toHaveBeenCalledTimes(1);
    expect(io.decodeHeic).not.toHaveBeenCalled();
  });

  test("the stored file is the re-encoded one (pixels only, so EXIF is gone), never the source", async () => {
    const io = fakeIo({ width: 1200, height: 800 });
    const source = file("photo.jpg", "image/jpeg", 2 * MB);

    const photo = await compressPhoto(source, io);

    expect(photo.blob).not.toBe(source);
    expect(io.encodes.length).toBeGreaterThan(0);
    expect(io.encodes[0]).toMatchObject({ width: 1200, height: 800 }); // small photos are never enlarged
  });

  test("lowers quality, then size, until it fits", async () => {
    const io = fakeIo({ width: 4000, height: 3000, bytesPerPixel: 1 });

    const photo = await compressPhoto(file("big.png", "image/png", 9 * MB), io);

    expect(photo.blob.size).toBeLessThanOrEqual(UPLOAD_TARGET_BYTES);
    expect(io.encodes.at(-1)!.width).toBeLessThan(1600);
    expect(io.encodes.map((e) => e.quality).slice(0, 3)).toEqual([0.82, 0.72, 0.62]);
  });

  test("a browser that cannot write WebP gets JPEG", async () => {
    const io = fakeIo({ width: 2000, height: 1500, webp: false });

    const photo = await compressPhoto(file("photo.webp", "image/webp", MB), io);

    expect(photo.type).toBe("image/jpeg");
    expect(photo.blob.type).toBe("image/jpeg");
  });

  test("a HEIC that no decoder can read asks for a JPEG", async () => {
    const io = fakeIo({ width: 10, height: 10, native: false });
    vi.mocked(io.decodeHeic).mockRejectedValue(new Error("bad heic"));

    await expect(compressPhoto(file("x.heic", "image/heic", MB), io)).rejects.toMatchObject({ problem: "heic" });
  });

  test("a photo that stays over 1 MB even at the smallest step is refused", async () => {
    const io = fakeIo({ width: 1600, height: 1600, bytesPerPixel: 100 });

    await expect(compressPhoto(file("noise.png", "image/png", 9 * MB), io)).rejects.toMatchObject({ problem: "too_big_after" });
  });
});

describe("refused before anything is sent (AC2)", () => {
  test.each([
    ["a PDF", file("menu.pdf", "application/pdf", 100_000), "type"],
    ["a GIF", file("cake.gif", "image/gif", 100_000), "type"],
    ["an SVG", file("logo.svg", "image/svg+xml", 1000), "type"],
    ["a file with no type and an unknown extension", file("cake.bmp", "", 1000), "type"],
    ["a JPEG over 10 MB", file("huge.jpg", "image/jpeg", 10 * MB + 1), "too_big"],
  ])("%s", async (_label, source, problem) => {
    const io = fakeIo({ width: 10, height: 10 });

    const error = await compressPhoto(source, io).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CompressError);
    expect((error as CompressError).problem).toBe(problem);
    expect(io.decode).not.toHaveBeenCalled();
  });

  test("exactly 10 MB is accepted", () => {
    expect(sourceProblem({ name: "a.jpg", type: "image/jpeg", size: 10 * MB })).toBeNull();
  });
});

describe("sniffImageType (server re-check of stored bytes)", () => {
  test.each([
    [[0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50], "image/webp"],
    [[0x25, 0x50, 0x44, 0x46], null],
    [[0x3c, 0x73, 0x76, 0x67], null],
  ])("%j -> %s", (bytes, type) => {
    expect(sniffImageType(new Uint8Array(bytes))).toBe(type);
  });
});
