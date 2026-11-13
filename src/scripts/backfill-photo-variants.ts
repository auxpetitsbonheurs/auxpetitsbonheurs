// Makes the missing 480/960 px copies of photos already stored, on STAGING only (S-276). Run by
// the manual `photo-variants` GitHub workflow (staging environment); locally only against a
// staging copy:
//   APP_ENV=staging DATABASE_URL=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run backfill:photo-variants
// Idempotent and safe to re-run. Prints file names and outcomes, never a URL or a key.
import sharp from "sharp";
import { publicImageUrl } from "../app/lib/images";
import { createRequestDb } from "../app/server/db.server";
import { BackfillRefused, assertBackfillAllowed, backfillPhotoVariants } from "../app/server/services/photo-variants-backfill.server";
import { signedPut } from "../app/server/services/menu-photos.server";
import { supabaseStorage } from "../app/server/storage.server";

const REQUIRED = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
/** Same quality as the editor's copies (lib/image-compress VARIANT_QUALITY 0.78). */
const QUALITY = 78;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  assertBackfillAllowed(process.env.APP_ENV);
} catch (error) {
  fail(error instanceof BackfillRefused ? error.message : "backfill:photo-variants refused.");
}
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) fail(`Missing: ${missing.join(", ")}. Nothing was written.`);

const supabaseUrl = process.env.SUPABASE_URL!;
const storage = supabaseStorage({ url: supabaseUrl, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const requestDb = createRequestDb(process.env.DATABASE_URL!);
try {
  const report = await backfillPhotoVariants(
    requestDb.db,
    {
      uploads: { ...storage, put: signedPut() },
      download: async (path) => {
        const response = await fetch(publicImageUrl(path, supabaseUrl), { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) {
          await response.body?.cancel();
          return null;
        }
        return new Uint8Array(await response.arrayBuffer());
      },
      measure: async (bytes) => {
        const { width, height } = await sharp(bytes).metadata();
        if (!width || !height) throw new Error("unreadable original");
        return { width, height };
      },
      resize: async (bytes, width, height, type) => {
        const image = sharp(bytes).resize({ width, height, fit: "fill" });
        const encoded = type === "image/webp" ? image.webp({ quality: QUALITY }) : image.jpeg({ quality: QUALITY, mozjpeg: true });
        return new Uint8Array(await encoded.toBuffer());
      },
    },
    process.env.APP_ENV,
  );
  for (const l of report.lines) console.log(`${l.source} ${l.file}: ${l.outcome}${l.widths.length ? ` [${l.widths.join(", ")}]` : ""}${l.reason ? ` (${l.reason})` : ""}`);
  console.log(`\nMade: ${report.made}. Up to date: ${report.upToDate}. Skipped: ${report.skipped}. Failed: ${report.failed}.`);
  if (report.failed > 0) process.exitCode = 1;
} catch (error) {
  // The message only: a driver error could quote the connection string in its details.
  console.error(`backfill:photo-variants failed: ${error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "[database url]") : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await requestDb.close();
}
