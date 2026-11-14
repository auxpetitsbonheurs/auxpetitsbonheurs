// One image field (S-059 AC6: homepage hero, About; S-053 AC8: a promotion's image): same rules
// as product photos (S-047), with the 480/960 copies (S-276).
// The chosen photo is checked, compressed in the browser (code loaded on first use), given a
// signed URL under `site/` and uploaded; the posted path is saved with Settings. Remove clears
// it (the file is removed after the save). A failure keeps the old image and says why.
import { ImagePlus, LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { Button } from "~/components/ui/button";
import { sourceProblem } from "~/domain/upload";
import { useI18n } from "~/i18n/react";
import { UploadError, putFile, requestUpload } from "~/lib/photo-upload";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export type ImageState = "idle" | "working" | "failed";

interface Props {
  id: string;
  name: string;
  label: string;
  hint: string;
  path: string | null;
  url: string | null;
  error?: string;
  /** The page's upload session (one per Settings page or editor view). */
  sessionId: () => string;
  /** Where the upload goes: Settings images (`site`, Owners) or promotion images (`promotions`, any admin). */
  scope?: "site" | "promotions" | "workshops";
  onChange: (state: ImageState) => void;
}

type Failure = "type" | "too_big" | "unreadable" | "heic" | "too_big_after" | "signed_out" | "refused" | "network";

export function SiteImageField({ id, name, label, hint, path: savedPath, url: savedUrl, error, sessionId, onChange, scope = "site" }: Props) {
  const { t } = useI18n();
  const [current, setCurrent] = useState({ path: savedPath, url: savedUrl });
  const [state, setState] = useState<ImageState>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState("");

  const update = (next: ImageState, why: Failure | null = null) => {
    setState(next);
    setFailure(why);
    onChange(next);
  };

  async function upload(file: File) {
    const problem = sourceProblem(file);
    if (problem) return update("failed", problem);
    update("working");
    setMessage(t("admin.settings.image.working"));
    try {
      const { compressPhoto, uploadVariants } = await import("~/lib/image-compress");
      const photo = await compressPhoto(file);
      const issued = await requestUpload(sessionId(), photo.type, photo.blob.size, undefined, scope);
      await putFile(issued.signedUrl, photo.blob, () => {});
      await uploadVariants(sessionId(), scope, { path: issued.path, type: photo.type }, photo.variants);
      setCurrent({ path: issued.path, url: URL.createObjectURL(photo.blob) });
      update("idle");
      setMessage(t("admin.settings.image.uploaded"));
    } catch (caught) {
      update("failed", caught instanceof UploadError ? caught.failure : ((caught as { problem?: Failure }).problem ?? "unreadable"));
      setMessage(t("admin.settings.image.failedShort"));
    }
  }

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void upload(file);
  };

  const remove = () => {
    setCurrent({ path: null, url: null });
    update("idle");
    setMessage(t("admin.settings.image.removed"));
  };

  const describedBy = [`${id}-hint`, failure || error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div id={id} tabIndex={-1} className="min-w-0 outline-offset-2">
      <p className="font-semibold">{label}</p>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <input type="hidden" name={name} value={current.path ?? ""} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-decorative">
          {current.url ? <img src={current.url} alt={t("admin.settings.image.alt", { label })} width={96} height={96} className="size-24 object-cover" /> : <span className="px-2 text-center text-sm">{t("admin.settings.image.none")}</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          {/* A real file input inside the label: one 44 px target, opens camera or gallery on phones. */}
          <label className={`relative inline-flex min-h-12 max-w-full items-center gap-2 rounded-md border-2 border-input bg-card px-4 py-2 max-[20rem]:px-2 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring ${state === "working" ? "opacity-60" : "cursor-pointer hover:bg-accent"}`}>
            {state === "working" ? <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" /> : <ImagePlus aria-hidden="true" className="size-5 shrink-0 max-[20rem]:hidden" />}
            {state === "working" ? t("admin.settings.image.working") : current.path ? t("admin.settings.image.replace", { label }) : t("admin.settings.image.choose", { label })}
            <input
              type="file"
              accept={ACCEPT}
              disabled={state === "working"}
              aria-describedby={describedBy}
              onChange={choose}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </label>
          {current.path && state !== "working" && (
            <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal max-[20rem]:px-2" onClick={remove}>
              <Trash2 aria-hidden="true" />
              {t("admin.settings.image.remove", { label })}
            </Button>
          )}
        </div>
      </div>
      {(failure || error) && (
        <p id={`${id}-error`} className="mt-1 inline-flex items-start gap-1 font-semibold text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {failure ? t(`admin.settings.image.failed.${failure}`) : error}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
