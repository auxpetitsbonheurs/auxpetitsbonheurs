// What a customer's chosen file really is, from its first bytes (E-08 S-152 AC3): the name and
// declared type can lie (a PDF renamed to .jpg), the signature cannot. Accepts JPEG, PNG and
// WebP by magic number and HEIC/HEIF by their ISO-BMFF `ftyp` brand. Runs before decoding.
import { sniffImageType } from "~/domain/upload";

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

/** True when the first bytes are a photo format the form takes. */
export function isPhotoSignature(head: Uint8Array): boolean {
  if (sniffImageType(head) !== null) return true;
  return head.length >= 12 && ascii(head, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(head, 8, 12));
}

/** Reads the first 16 bytes of `file` and checks them. */
export async function hasPhotoSignature(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return isPhotoSignature(head);
}
