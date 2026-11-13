import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Form, useNavigation, useSearchParams } from "react-router";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { useI18n } from "~/i18n/react";
import { isPendingIntent } from "~/lib/pending";

export interface CancelRefusal {
  code: string;
  message: string;
}

const destructiveOutline = "border-destructive text-destructive hover:bg-accent";

/** The refusal in customer words (no blame): status changed, version changed, or anything else. */
function refusalKey(code: string): string {
  if (code === "CANCEL_NOT_ALLOWED") return "order.tracking.cancel.notAllowed";
  if (code === "ORDER_CHANGED") return "order.tracking.cancel.changed";
  return "order.tracking.cancel.failed";
}

/**
 * A refused cancel in customer words, focused when it appears (S-096 AC4, AC10). Lives in the
 * page, not in `CancelOrder`, which disappears when the order is no longer cancellable.
 */
export function CancelRefusalAlert({ refusal }: { refusal: CancelRefusal | undefined }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refusal) requestAnimationFrame(() => ref.current?.focus());
  }, [refusal]);
  if (!refusal) return null;
  return (
    <Alert ref={ref} tabIndex={-1} role="alert" tone="warning" className="mt-6 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <p>{t(refusalKey(refusal.code))}</p>
    </Alert>
  );
}

/** The confirm form: "Cancel order APB-0042" (destructive) and "Keep order" (S-096 AC10). */
function ConfirmForm({ number, version, onKeep }: { number: string; version: number; onKeep: () => void }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  return (
    <Form method="post" className="mt-4 flex flex-wrap gap-3">
      <input type="hidden" name="version" value={version} />
      <SubmitButton name="intent" value="cancel" variant="destructive" size="lg" pending={isPendingIntent(navigation, "cancel")} pendingText={t("order.tracking.cancel.sending")} className="max-w-full whitespace-normal">
        {t("order.tracking.cancel.confirm", { number })}
      </SubmitButton>
      <Button type="button" variant="outline" size="lg" onClick={onKeep}>
        {t("order.tracking.cancel.keep")}
      </Button>
    </Form>
  );
}

/**
 * Cancel while pending (S-096). With JavaScript the trigger opens the confirm dialog (native
 * modal `<dialog>`: focus trapped, Esc closes, focus returns to the trigger). Without it, the
 * trigger is a plain GET to `?confirm=cancel`, which renders the same confirm form inline.
 * A refusal closes the dialog; `CancelRefusalAlert` (rendered by the page, so it stays when
 * the order is no longer cancellable) announces it.
 */
export function CancelOrder({ number, version, refusal }: { number: string; version: number; refusal: CancelRefusal | undefined }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const inline = params.get("confirm") === "cancel";
  const [open, setOpen] = useState(false);
  // A new refusal closes the dialog (adjusted while rendering).
  const [shownRefusal, setShownRefusal] = useState(refusal);
  if (refusal !== shownRefusal) {
    setShownRefusal(refusal);
    if (refusal) setOpen(false);
  }
  const openDialog = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setOpen(true);
  };
  const keepInline = () => setParams({}, { replace: true, preventScrollReset: true });
  return (
    <div className="mt-6">
      {inline ? (
        <div className="rounded-card border-2 border-destructive p-4">
          {/* Under `no-referrer` a plain form post sends `Origin: null`, which the action's CSRF check
              refuses; same-origin still never lets the token leave the site (threat-model G-07). */}
          <meta name="referrer" content="same-origin" />
          <h3 className="text-lg font-semibold">{t("order.tracking.cancel.title", { number })}</h3>
          <p className="mt-2 max-w-measure">{t("order.tracking.cancel.body")}</p>
          <ConfirmForm number={number} version={version} onKeep={keepInline} />
        </div>
      ) : (
        <form method="get">
          <Button type="submit" name="confirm" value="cancel" variant="outline" size="lg" className={destructiveOutline} aria-label={t("order.tracking.cancel.buttonLabel", { number })} onClick={openDialog}>
            {t("order.tracking.cancel.button")}
          </Button>
        </form>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t("order.tracking.cancel.title", { number })} closeLabel={t("order.tracking.cancel.close")} variant="dialog">
        <p className="max-w-measure">{t("order.tracking.cancel.body")}</p>
        <ConfirmForm number={number} version={version} onKeep={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
