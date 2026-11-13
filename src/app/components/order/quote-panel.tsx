// The quote on the tracking page (E-08 S-158, S-159, S-161 AC2): waiting for a quote; the quote
// with its amount, note and "Valid until"; Accept (a real button named with the amount) and
// Decline behind a confirm dialog whose default focus is "Keep the quote"; the expired and
// "quote was updated" messages. Every answer posts the version the page showed; the amount is
// only ever the server's. Works without JavaScript except the dialog, which then posts directly.
import { useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { useHydrated } from "~/lib/use-hydrated";

export interface QuoteView {
  amountRs: number;
  note: string | null;
  expiresLabel: string;
  canRespond: boolean;
  expired: boolean;
}

export interface QuoteRefusal {
  code: string;
  message: string;
}

function DeclineDialog({ version, pending }: { version: number; pending: boolean }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  // Default focus on the safe choice (S-159 AC6), after the dialog has focused its title.
  useEffect(() => {
    if (open) keep.current?.focus();
  }, [open]);
  const confirm = (
    <Form method="post">
      <input type="hidden" name="version" value={version} />
      <SubmitButton name="intent" value="declineQuote" variant={hydrated ? "destructive" : "outline"} size="lg" className="w-full whitespace-normal" pending={pending} pendingText={t("customRequest.tracking.declining")}>
        {hydrated ? t("customRequest.tracking.declineConfirm") : t("customRequest.tracking.decline")}
      </SubmitButton>
    </Form>
  );
  // Without JavaScript the button posts at once (the server still checks everything).
  if (!hydrated) return confirm;
  return (
    <>
      <Button type="button" variant="outline" size="lg" className="w-full whitespace-normal" onClick={() => setOpen(true)}>
        {t("customRequest.tracking.decline")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} variant="dialog" title={t("customRequest.tracking.declineTitle")} closeLabel={t("customRequest.tracking.close")}>
        <p className="mt-2">{t("customRequest.tracking.declineBody")}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button ref={keep} type="button" variant="outline" size="lg" className="whitespace-normal" onClick={() => setOpen(false)}>
            {t("customRequest.tracking.cancel")}
          </Button>
          {confirm}
        </div>
      </Modal>
    </>
  );
}

/** Moves focus to a message that replaced the buttons, so the outcome is heard (S-158 AC9). */
function useFocus(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  return ref;
}

export function QuotePanel({ status, quote, version, refusal, justAccepted, newRequestHref, reloadHref }: { status: string; quote: QuoteView | null; version: number; refusal: QuoteRefusal | undefined; justAccepted: boolean; newRequestHref: string; reloadHref: string }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const pending = navigation.state !== "idle" ? String(navigation.formData?.get("intent") ?? "") : "";
  const accepted = useFocus(justAccepted);
  const refused = useFocus(refusal !== undefined);
  if (status === "quote_needed") {
    return (
      <Alert tone="info" title={t("customRequest.tracking.waiting")} className="mt-6">
        <p>{t("customRequest.tracking.waitingBody")}</p>
      </Alert>
    );
  }
  return (
    <>
      {justAccepted && (
        <Alert ref={accepted} tabIndex={-1} role="status" tone="success" title={t("customRequest.tracking.accepted")} className="mt-6 outline-offset-2" />
      )}
      {refusal && (
        <Alert ref={refused} tabIndex={-1} role="alert" tone={refusal.code === "QUOTE_EXPIRED" ? "warning" : "danger"} className="mt-6 outline-offset-2">
          <p className="font-semibold">{refusal.code === "ORDER_CHANGED" ? t("customRequest.tracking.changed") : refusal.code === "QUOTE_EXPIRED" ? t("customRequest.tracking.expired") : refusal.message}</p>
          <a href={reloadHref} className="inline-flex min-h-11 items-center font-semibold link">
            {t("customRequest.tracking.reload")}
          </a>
        </Alert>
      )}
      {quote && status === "quote_sent" && (
        <section aria-labelledby="quote-heading" className="mt-8">
          <h2 id="quote-heading" className="section-title-start text-h2">
            {t("customRequest.tracking.quoteTitle")}
          </h2>
          <div className="mt-4 grid gap-2 rounded-lg bg-muted p-5">
            <p className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span>{t("customRequest.tracking.amount")}</span>
              <span className="text-2xl font-semibold whitespace-nowrap tabular-nums">{formatRupees(quote.amountRs)}</span>
            </p>
            <p className="text-sm">{t("customRequest.tracking.amountNote")}</p>
            {quote.note && (
              <div>
                <p className="font-semibold">{t("customRequest.tracking.note")}</p>
                <p className="whitespace-pre-line wrap-anywhere">{quote.note}</p>
              </div>
            )}
            <p className="font-semibold">{t("customRequest.tracking.validUntil", { date: quote.expiresLabel })}</p>
          </div>
          {quote.canRespond ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Form method="post">
                <input type="hidden" name="version" value={version} />
                <SubmitButton name="intent" value="acceptQuote" size="lg" className="w-full whitespace-normal" pending={pending === "acceptQuote"} pendingText={t("customRequest.tracking.accepting")}>
                  {t("customRequest.tracking.accept", { amount: formatRupees(quote.amountRs) })}
                </SubmitButton>
              </Form>
              <DeclineDialog version={version} pending={pending === "declineQuote"} />
            </div>
          ) : (
            quote.expired && (
              <Alert tone="warning" title={t("customRequest.tracking.expired")} className="mt-4">
                <a href={newRequestHref} className="inline-flex min-h-11 items-center font-semibold link">
                  {t("customRequest.tracking.newRequest")}
                </a>
              </Alert>
            )
          )}
        </section>
      )}
    </>
  );
}
