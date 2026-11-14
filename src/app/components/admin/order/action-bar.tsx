import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { SubmitButton } from "~/components/ui/submit-button";
import { showToast } from "~/components/ui/toaster";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderLoaderData } from "~/routes/admin/order";
import { InvoiceDialog, preloadInvoicePdf } from "./invoice-dialog";
import { MoreActionsSheet, ReasonDialog, type ReasonIntent } from "./more-actions";
import { type OrderActionAnswer, type StatusIntent, useOrderAction } from "./use-order-action";

const RELOAD_CODES = new Set(["ORDER_CHANGED", "INVALID_TRANSITION", "NOT_FOUND"]);

type Step = "idle" | "confirmPaid" | "confirmRefund";
type Submit = (intent: StatusIntent, extra?: Record<string, string>) => void;
type Fetcher = ReturnType<typeof useOrderAction>["fetcher"];

/** The sentence for a successful answer, in the admin's language. */
function useResultText(number: string) {
  const { t } = useI18n();
  return (answer: OrderActionAnswer | undefined): string => {
    if (!answer?.ok || !answer.order) return "";
    const status = t(`admin.status.${answer.order.status}`);
    const fixed: Partial<Record<string, string>> = {
      approve: t("admin.order.approved", { number }),
      markPaid: t("admin.order.markedPaid", { number }),
      undoPaid: t("admin.order.undone", { number }),
      decline: t("admin.order.declined", { number }),
      declineRequest: t("admin.order.declined", { number }),
      markRefunded: t("admin.order.refundedDone"),
      setPaid: t(answer.order.paid ? "admin.order.done.paid" : "admin.order.done.unpaid", { number }),
    };
    return fixed[answer.intent] ?? t(`admin.order.done.${answer.intent}`, { number, status });
  };
}

/**
 * The outcome of the last action, said once in the polite region and focused (the pressed button
 * may be gone); after Payment received it offers Undo (S-279 AC3). Refusals other than a conflict
 * (which has its own Alert) show an error toast.
 */
function ResultLine({ answer, number, fetcher, busy }: { answer: OrderActionAnswer | undefined; number: string; fetcher: Fetcher; busy: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLParagraphElement>(null);
  const text = useResultText(number)(answer);
  useEffect(() => {
    if (text) ref.current?.focus();
    else if (answer && !answer.ok && !RELOAD_CODES.has(answer.error.code)) showToast(answer.error.message, "error");
  }, [answer, text]);
  const undoVersion = answer?.ok && answer.intent === "markPaid" ? answer.order?.version : undefined;
  return (
    <div className={text ? "flex flex-wrap items-center gap-3 px-1 pb-2" : undefined}>
      <p ref={ref} role="status" tabIndex={-1} data-testid="approve-result" className={text ? "font-semibold outline-offset-2" : "sr-only"}>
        {text}
      </p>
      {undoVersion !== undefined && (
        <fetcher.Form method="post">
          <input type="hidden" name="version" value={undoVersion} />
          <SubmitButton name="intent" value="undoPaid" variant="outline" size="sm" pending={busy} pendingText={t("admin.order.undoing")} aria-label={t("admin.order.undoLabel", { number })}>
            {t("admin.order.undo")}
          </SubmitButton>
        </fetcher.Form>
      )}
    </div>
  );
}

/** "Rs 1,250 received by Juice for APB-0042?" → Yes / Back (S-279 AC2), in the bar. */
function ConfirmPaid({ data: { order }, fetcher, busy, onBack }: { data: OrderLoaderData; fetcher: Fetcher; busy: boolean; onBack: () => void }) {
  const { t } = useI18n();
  const amount = formatRupees(order.totalRs);
  return (
    <fetcher.Form method="post" aria-labelledby="confirm-paid" className="grid gap-3 px-1">
      <input type="hidden" name="version" value={order.version} />
      <p id="confirm-paid" className="text-lg font-semibold">
        {t("admin.order.markPaidConfirm", { amount, number: order.number })}
      </p>
      <p className="text-sm">{t("admin.order.markPaidHint", { amount, number: order.number })}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <SubmitButton name="intent" value="markPaid" pending={busy} pendingText={t("admin.order.markingPaid")} size="lg" autoFocus>
          {t("admin.order.markPaidYes")}
        </SubmitButton>
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          {t("admin.order.cancelStep")}
        </Button>
      </div>
    </fetcher.Form>
  );
}

/** "Refund Rs X to the customer by Juice" with Refunded → confirm (S-281 AC3). */
function RefundStep({ data: { order, payment, customer }, step, setStep, fetcher, busy }: { data: OrderLoaderData; step: Step; setStep: (step: Step) => void; fetcher: Fetcher; busy: boolean }) {
  const { t } = useI18n();
  const amount = formatRupees(payment.refund?.amountRs ?? 0);
  return (
    <div className="grid gap-2 px-1" data-testid="refund-step">
      <p className="text-lg font-semibold">{t("admin.order.refundTitle", { amount })}</p>
      <p className="text-sm wrap-anywhere">{t("admin.order.refundBody", { phone: customer.phone })}</p>
      {step === "confirmRefund" ? (
        <fetcher.Form method="post" aria-label={t("admin.order.markRefundedConfirm", { amount })} className="grid gap-2">
          <input type="hidden" name="version" value={order.version} />
          <p className="font-semibold">{t("admin.order.markRefundedConfirm", { amount })}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <SubmitButton name="intent" value="markRefunded" pending={busy} pendingText={t("admin.order.markingRefunded")} size="lg" autoFocus>
              {t("admin.order.markRefundedYes")}
            </SubmitButton>
            <Button type="button" variant="outline" size="lg" onClick={() => setStep("idle")}>
              {t("admin.order.cancelStep")}
            </Button>
          </div>
        </fetcher.Form>
      ) : (
        <Button type="button" size="lg" className="w-full" onClick={() => setStep("confirmRefund")}>
          {t("admin.order.markRefunded")}
        </Button>
      )}
    </div>
  );
}

/** The one next step: Approve, Payment received (asks first), or Next named after the target status. */
function PrimaryAction({ data: { order, allowed }, busy, onConfirmPaid }: { data: OrderLoaderData; busy: boolean; onConfirmPaid: () => void }) {
  const { t } = useI18n();
  const wide = "h-auto min-h-12 min-w-0 flex-1 basis-40 px-4 whitespace-normal";
  if (allowed.markPaid) {
    return (
      <Button type="button" size="lg" className={wide} onClick={onConfirmPaid} disabled={busy}>
        {t("admin.order.markPaid")}
      </Button>
    );
  }
  const primary = allowed.approve
    ? { intent: "approve", label: t("admin.order.approveNamed", { number: order.number }) }
    : allowed.advance
      ? { intent: "advance", label: t(`admin.order.next.${allowed.advance}`) }
      : null;
  if (!primary) return <p className="flex min-h-12 min-w-0 flex-1 basis-40 items-center">{t("admin.order.noActions")}</p>;
  return (
    <SubmitButton name="intent" value={primary.intent} pending={busy} pendingText={t("admin.order.working")} size="lg" className={wide}>
      {primary.label}
    </SubmitButton>
  );
}

/**
 * Sticky bar in the bottom half of a 375x667 screen (S-116 AC9, S-117 AC8-AC9, S-126): the one next
 * step, More actions for the rest, and the payment steps (S-279, S-281). Every action is optimistic
 * (the header shows the expected status at once); while a request is in flight further presses are
 * ignored, so a double tap never double-advances.
 */
export function OrderActionBar({ data, actionData }: { data: OrderLoaderData; actionData: unknown }) {
  const { t } = useI18n();
  const { order, allowed } = data;
  const { fetcher, pending } = useOrderAction(order, allowed);
  const answer = fetcher.state === "idle" ? (fetcher.data ?? (actionData as OrderActionAnswer | undefined)) : undefined;
  // A new answer or a new version closes any open step: a step belongs to the state it was opened in.
  const resetKey = `${order.version}:${answer ? (answer.ok ? answer.intent : answer.error.code) : ""}`;
  const [opened, setOpened] = useState<{ key: string; step: Step }>({ key: resetKey, step: "idle" });
  const step = opened.key === resetKey ? opened.step : "idle";
  const setStep = (next: Step) => setOpened({ key: resetKey, step: next });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<ReasonIntent | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const busy = pending !== null;

  const submit: Submit = (intent, extra = {}) => {
    if (busy) return;
    setSheetOpen(false);
    setDialog(null);
    fetcher.submit({ intent, version: String(order.version), ...extra }, { method: "post" });
  };

  return (
    <div data-sticky-bar data-editor-bar="" className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-border bg-card px-4 py-2 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:top-6 md:bottom-auto md:mx-0 md:mt-6 md:rounded-card md:border md:p-4 md:shadow-none">
      <ResultLine answer={answer} number={order.number} fetcher={fetcher} busy={busy} />
      {allowed.markRefunded ? (
        <RefundStep data={data} step={step} setStep={setStep} fetcher={fetcher} busy={busy} />
      ) : step === "confirmPaid" && allowed.markPaid ? (
        <ConfirmPaid data={data} fetcher={fetcher} busy={busy} onBack={() => setStep("idle")} />
      ) : (
        <fetcher.Form method="post" aria-label={t("admin.order.actionsLabel")} className="flex flex-wrap gap-2 px-1">
          <input type="hidden" name="version" value={order.version} />
          <PrimaryAction data={data} busy={busy} onConfirmPaid={() => setStep("confirmPaid")} />
          <Button type="button" variant="outline" size="lg" className="h-auto min-h-12 grow-0 px-4 max-[22rem]:grow" onClick={() => (setSheetOpen(true), void preloadInvoicePdf())} aria-haspopup="dialog">
            <Ellipsis aria-hidden="true" />
            <span className="max-[22rem]:sr-only">{t("admin.order.moreActions")}</span>
          </Button>
        </fetcher.Form>
      )}
      <MoreActionsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} data={data} busy={busy} onSubmit={submit} onAsk={(intent) => (setSheetOpen(false), setDialog(intent))} onInvoice={() => (setSheetOpen(false), setInvoiceOpen(true))} />
      <InvoiceDialog orderId={order.id} open={invoiceOpen} onClose={() => setInvoiceOpen(false)} />
      <ReasonDialog intent={dialog} onClose={() => setDialog(null)} data={data} onConfirm={(intent, reason) => submit(intent === "decline" && allowed.declineRequest ? "declineRequest" : intent, reason ? { reason } : {})} />
    </div>
  );
}
