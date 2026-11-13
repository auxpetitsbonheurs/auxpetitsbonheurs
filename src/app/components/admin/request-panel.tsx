// The custom request on the admin order screen (E-08 S-155, S-156, S-161): every request field,
// the reference photos as buttons that open an accessible lightbox (the native modal dialog:
// focus kept inside, Escape closes, focus returns to the photo), the current quote, and the
// send-quote sheet. Server-rendered; the sheet and the lightbox need JavaScript.
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { Form } from "react-router";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { type AdminRequestView, QUOTE_LIMITS } from "~/domain/custom-request";
import { formatLongDate } from "~/domain/time";
import { useI18n } from "~/i18n/react";

function PhotoGrid({ photos }: { photos: AdminRequestView["photos"] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return <p className="mt-3">{t("admin.request.noPhotos")}</p>;
  const total = photos.length;
  const shown = open === null ? null : photos[open];
  return (
    <>
      <ul className="mt-3 grid grid-cols-2 gap-3 min-[30rem]:grid-cols-3" aria-label={t("admin.request.photosTitle")}>
        {photos.map((photo, i) => (
          <li key={i}>
            {photo.url ? (
              <button type="button" onClick={() => setOpen(i)} className="block w-full overflow-hidden rounded-lg border-2 border-input outline-offset-2">
                <img src={photo.url} alt={t("admin.request.photoAlt", { n: i + 1 })} className="aspect-square h-auto w-full object-cover" loading="lazy" />
                <span className="sr-only">{t("admin.request.openPhoto", { n: i + 1, total })}</span>
              </button>
            ) : (
              <p className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-2 text-center text-sm">
                <ImageOff aria-hidden="true" className="size-5" />
                {t("admin.request.photoUnavailable", { n: i + 1 })}
              </p>
            )}
          </li>
        ))}
      </ul>
      <Modal open={shown !== null && shown !== undefined} onClose={() => setOpen(null)} variant="dialog" title={open === null ? "" : t("admin.request.photoTitle", { n: open + 1, total })} closeLabel={t("admin.request.close")}>
        {shown?.url && <img src={shown.url} alt={t("admin.request.photoAlt", { n: (open ?? 0) + 1 })} className="mt-3 max-h-[70dvh] w-full rounded-lg object-contain" />}
      </Modal>
    </>
  );
}

/** The reference photos of a custom request (S-155 AC2, AC3, AC5, AC8), under the request's fields. */
export function RequestPhotos({ photos }: { photos: AdminRequestView["photos"] }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="request-photos-heading" className="mt-8">
      <h2 id="request-photos-heading" className="text-h2">
        {t("admin.request.photosTitle")}
      </h2>
      <PhotoGrid photos={photos} />
    </section>
  );
}

export interface QuoteResult {
  ok: boolean;
  intent?: string;
  error?: { code: string; message: string; fields?: Record<string, string> };
  values?: Record<string, string>;
}

/** Send quote / Send a new quote (S-156, S-161): a sheet with amount, note and expiry. */
export function QuoteSheet({ request, version, fulfilOn, today, result, pending }: { request: AdminRequestView; version: number; fulfilOn: string; today: string; result: QuoteResult | undefined; pending: boolean }) {
  const { t, locale } = useI18n();
  const resend = request.quote !== null;
  const failed = result && !result.ok && result.intent === "sendQuote" ? result : undefined;
  const [open, setOpen] = useState(false);
  const [expiresOn, setExpiresOn] = useState(failed?.values?.expiresOn ?? request.quote?.expiresOn ?? request.quoteDefaults.expiresOn);
  // A new answer decides once: a refused send keeps the sheet open with its errors, a sent quote closes it.
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    if (failed) setOpen(true);
    else if (result?.ok && result.intent === "sendQuote") setOpen(false);
  }
  const errors = failed?.error?.fields ?? {};
  const values = failed?.values ?? (request.quote ? { amountRs: String(request.quote.amountRs), note: request.quote.note ?? "" } : {});
  const label = resend ? t("admin.request.sendNewQuote") : t("admin.request.sendQuote");
  const sent = result?.ok === true && result.intent === "sendQuote";
  return (
    <>
      {/* The outcome, said once politely (the shared action bar only knows its own actions). */}
      <p role="status" className={sent ? "mt-6 font-semibold" : "sr-only"}>
        {sent ? t("admin.request.quoteSent") : ""}
      </p>
      <Button type="button" size="lg" className="mt-6 w-full whitespace-normal" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} closeLabel={t("admin.request.close")}>
        <Form method="post" noValidate className="mt-4 grid gap-4">
          <input type="hidden" name="version" value={version} />
          {failed && (
            <p role="alert" className="font-semibold text-destructive wrap-anywhere">
              {failed.error?.message}
            </p>
          )}
          <TextField id="quote-amount" name="amountRs" type="number" inputMode="numeric" min={QUOTE_LIMITS.amountMin} max={QUOTE_LIMITS.amountMax} label={t("admin.request.amount")} hint={t("admin.request.amountHint")} error={errors.amountRs} defaultValue={values.amountRs} />
          <TextField id="quote-note" name="note" multiline rows={3} maxLength={QUOTE_LIMITS.noteMax} label={t("admin.request.note")} optionalLabel={`(${t("customRequest.optional")})`} hint={t("admin.request.noteHint")} error={errors.note} defaultValue={values.note} />
          <TextField id="quote-expires" name="expiresOn" type="date" min={today} label={t("admin.request.expiry")} hint={t("admin.request.expiryHint")} error={errors.expiresOn} value={expiresOn} onChange={(event) => setExpiresOn(event.currentTarget.value)} />
          {expiresOn > fulfilOn && (
            <p role="status" className="rounded-md border-2 border-warning p-2 font-semibold">
              {t("admin.request.expiryAfterEvent", { date: formatLongDate(fulfilOn, locale) })}
            </p>
          )}
          <SubmitButton name="intent" value="sendQuote" pending={pending} pendingText={t("admin.request.sending")} pendingLabel={t("admin.request.sending")} size="lg" className="whitespace-normal">
            {label}
          </SubmitButton>
        </Form>
      </Modal>
    </>
  );
}
