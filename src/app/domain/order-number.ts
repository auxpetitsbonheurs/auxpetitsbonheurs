// Order numbers and tracking tokens (FR-024, NFR-013). The number comes from the
// `counter` row inside the order transaction; the token is independent random data.

/** "APB-0001": the Settings prefix plus the number padded to at least 4 digits. */
export function formatOrderNumber(prefix: string, number: number): string {
  return `${prefix}${String(number).padStart(4, "0")}`;
}

type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const defaultFill: RandomFill = (bytes) => crypto.getRandomValues(bytes);

/** 32 random bytes as 43 base64url characters (256 bits; not derivable from the number). */
export function newTrackingToken(fill: RandomFill = defaultFill): string {
  const bytes = fill(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
