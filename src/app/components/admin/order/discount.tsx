// Order discount on the admin order screen (S-320, contracts.md "Order discounts"): the subtotal,
// "Discount (reason) −Rs X" and the total, then Add / Change / Remove while the order is unpaid
// and pending approval, awaiting payment or a quote. Paid locks it (read-only, with why). The
// dialog checks the amount as it is typed and shows the new total before saving; the server
// answers with the same rules (domain/order-discount), and a stale page gets "Reload".
import { BadgePercent } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { RadioCard } from "~/components/ui/radio-card";
import { showToast } from "~/components/ui/toaster";
import { DISCOUNT_REASON_MAX, type DiscountKind, resolveDiscount } from "~/domain/order-discount";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderLoaderData } from "~/routes/admin/order";
import { orderLinkClass } from "./header";
import { Section } from "./sections";

type Answer =
  | { ok: true; intent: "setDiscount" | "removeDiscount" }
  | { ok: false; intent?: string | null; error: { code: string; message: string; fields?: Record<string, string> } };

const row = "flex flex-wrap items-baseline justify-between gap-x-4";

/** A whole number as typed ("1,200", "10"), or null. */
export function typedNumber(text: string): number | null {
  const plain = text.trim().replace(/[\s,]/g, "");
  return /^\d{1,7}$/.test(plain) ? Number(plain) : null;
}

/** "Discount (Loyal customer, 10%)" / "Discount". */
function discountLabel(t: ReturnType<typeof useI18n>["t"], discount: { percent: number | null; reason: string | null }): string {
  const parts = [discount.reason, discount.percent === null ? null : `${discount.percent}%`].filter(Boolean).join(", ");
  return parts ? t("admin.discount.lineWith", { detail: parts }) : t("admin.discount.line");
}

/** Subtotal, discount and total: the money lines shared by the Payment and Items sections. */
export function DiscountLines({ discount, totalRs, totalLabel }: { discount: NonNullable<OrderLoaderData["order"]["discount"]>; totalRs: number; totalLabel: string }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-1" data-testid="discount-lines">
      <p className={row}>
        <span>{t("admin.discount.subtotal")}</span>
        <span className="tabular-nums">{formatRupees(discount.subtotalRs)}</span>
      </p>
      <p className={row}>
        <span className="min-w-0 wrap-anywhere">{discountLabel(t, discount)}</span>
        <span className="shrink-0 tabular-nums">−{formatRupees(discount.discountRs)}</span>
      </p>
      <p className={`${row} font-semibold`}>
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatRupees(totalRs)}</span>
      </p>
    </div>
  );
}

function useDiscountFetcher(onSaved: (intent: string) => void) {
  // Unkeyed: each control has its own answer, and a reopened dialog starts without an old one.
  const fetcher = useFetcher<Answer>();
  const answer = fetcher.state === "idle" ? fetcher.data : undefined;
  useEffect(() => {
    if (answer?.ok) onSaved(answer.intent);
    // Only a new answer matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);
  return { fetcher, answer, busy: fetcher.state !== "idle" };
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  data: OrderLoaderData;
}

function initialKind(discount: OrderLoaderData["order"]["discount"]): DiscountKind {
  return discount?.percent ? "percent" : "amount";
}

function initialValue(discount: OrderLoaderData["order"]["discount"]): string {
  if (!discount) return "";
  return String(discount.percent ?? discount.discountRs);
}

/** What to say under the amount: the server's message, else the typed value's problem, else the new total. */
function preview(t: ReturnType<typeof useI18n>["t"], kind: DiscountKind, text: string, goodsRs: number, subtotalRs: number) {
  const value = typedNumber(text);
  if (text.trim() === "") return { error: null, total: null };
  if (value === null) return { error: t("admin.discount.errors.value"), total: null };
  const resolved = resolveDiscount({ kind, value }, goodsRs);
  if (!resolved.ok) {
    if (goodsRs < 1) return { error: t("admin.discount.errors.nothing"), total: null };
    return { error: kind === "percent" ? t("admin.discount.errors.percent") : t("admin.discount.errors.amount", { max: formatRupees(goodsRs) }), total: null };
  }
  return { error: null, total: { discountRs: resolved.discount.discountRs, totalRs: subtotalRs - resolved.discount.discountRs } };
}

function DiscountDialog({ open, onClose, data }: DialogProps) {
  const { t } = useI18n();
  const { order } = data;
  const subtotalRs = order.discount?.subtotalRs ?? order.totalRs;
  const [kind, setKind] = useState<DiscountKind>(initialKind(order.discount));
  const [text, setText] = useState(initialValue(order.discount));
  const [reason, setReason] = useState(order.discount?.reason ?? "");
  const [tried, setTried] = useState(false);
  const { fetcher, answer, busy } = useDiscountFetcher((intent) => {
    if (intent !== "setDiscount") return;
    showToast(t("admin.discount.saved"));
    onClose();
  });
  const shown = preview(t, kind, text, order.goodsRs, subtotalRs);
  const server = answer && !answer.ok && answer.intent === "setDiscount" ? answer.error : null;
  const valueError = (tried && text.trim() === "" ? t("admin.discount.errors.value") : shown.error) ?? server?.fields?.value ?? null;
  const reasonError = reason.trim().length > DISCOUNT_REASON_MAX ? t("admin.discount.errors.reason", { max: DISCOUNT_REASON_MAX }) : (server?.fields?.reason ?? null);
  const stale = server && !server.fields ? server : null;
  const submit = () => {
    setTried(true);
    if (typedNumber(text) === null || shown.error || reasonError) return;
    void fetcher.submit({ intent: "setDiscount", version: String(order.version), kind, value: text, reason: reason.trim() }, { method: "post" });
  };
  const valueDescribedBy = ["discount-value-hint", valueError && "discount-value-error", shown.total && "discount-preview"].filter(Boolean).join(" ");
  return (
    <Modal open={open} onClose={onClose} title={order.discount ? t("admin.discount.changeTitle") : t("admin.discount.addTitle")} closeLabel={t("admin.states.close")} variant="dialog">
      <form onSubmit={(event) => (event.preventDefault(), submit())} noValidate>
        <p>{t("admin.discount.intro", { goods: formatRupees(order.goodsRs) })}</p>
        <fieldset className="mt-4">
          <legend className="font-semibold">{t("admin.discount.kind")}</legend>
          {/* Card rows: the whole card is the radio, so the target is the card (44 px+). */}
          <div className="mt-2 grid gap-2 min-[24rem]:grid-cols-2">
            {(["amount", "percent"] as const).map((option) => (
              <RadioCard
                key={option}
                id={`discount-kind-${option}`}
                name="kind"
                value={option}
                title={t(`admin.discount.kinds.${option}`)}
                defaultChecked={kind === option}
                onChoose={() => setKind(option)}
              />
            ))}
          </div>
        </fieldset>
        <label htmlFor="discount-value" className="mt-4 block font-semibold">
          {kind === "percent" ? t("admin.discount.percentLabel") : t("admin.discount.amountLabel")}
        </label>
        <p id="discount-value-hint" className="text-sm text-muted-foreground">
          {kind === "percent" ? t("admin.discount.percentHint") : t("admin.discount.amountHint", { max: formatRupees(order.goodsRs) })}
        </p>
        <div className="mt-2 flex items-stretch">
          {kind === "amount" && (
            <span aria-hidden="true" className="inline-flex items-center rounded-l-md border-2 border-r-0 border-input bg-muted px-3 font-semibold">
              Rs
            </span>
          )}
          <input
            id="discount-value"
            name="value"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            maxLength={12}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={valueError ? true : undefined}
            aria-describedby={valueDescribedBy}
            className={`block min-h-12 w-full min-w-0 border-2 border-input bg-card px-3 py-2 text-base tabular-nums text-foreground aria-invalid:border-destructive ${kind === "amount" ? "rounded-r-md" : "rounded-l-md"}`}
          />
          {kind === "percent" && (
            <span aria-hidden="true" className="inline-flex items-center rounded-r-md border-2 border-l-0 border-input bg-muted px-3 font-semibold">
              %
            </span>
          )}
        </div>
        {valueError && (
          <p id="discount-value-error" className="mt-1 font-semibold text-destructive wrap-anywhere">
            {valueError}
          </p>
        )}
        <p id="discount-preview" aria-live="polite" className="mt-2 min-h-6 font-semibold">
          {shown.total ? t("admin.discount.preview", { discount: formatRupees(shown.total.discountRs), total: formatRupees(shown.total.totalRs) }) : ""}
        </p>
        <label htmlFor="discount-reason" className="mt-3 block font-semibold">
          {t("admin.discount.reasonLabel")} <span className="font-normal">{t("admin.discount.optional")}</span>
        </label>
        <p id="discount-reason-hint" className="text-sm text-muted-foreground">
          {t("admin.discount.reasonHint", { max: DISCOUNT_REASON_MAX })}
        </p>
        <input
          id="discount-reason"
          name="reason"
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={["discount-reason-hint", reasonError && "discount-reason-error"].filter(Boolean).join(" ")}
          className="mt-2 block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive"
        />
        {reasonError && (
          <p id="discount-reason-error" className="mt-1 font-semibold text-destructive wrap-anywhere">
            {reasonError}
          </p>
        )}
        {data.payment.awaiting && <p className="mt-3 text-sm">{t("admin.discount.customerToldAwaiting")}</p>}
        {stale && (
          <Alert tone="danger" role="alert" className="mt-3">
            <p className="font-semibold">{stale.message}</p>
            <a href={`/admin/orders/${order.id}`} className={orderLinkClass}>
              {t("admin.order.reload")}
            </a>
          </Alert>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="h-auto min-h-11 flex-1 whitespace-normal">
            {t("admin.discount.keep")}
          </Button>
          <Button type="submit" disabled={busy} className="h-auto min-h-11 flex-1 whitespace-normal">
            {busy ? t("admin.discount.saving") : t("admin.discount.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type DiscountFetcher = ReturnType<typeof useDiscountFetcher>;

/** Remove: one tap (it can be added again at once); "Removing…" then a toast. Its fetcher lives in the block, which outlives the button. */
function RemoveButton({ data, remover }: { data: OrderLoaderData; remover: DiscountFetcher }) {
  const { t } = useI18n();
  const { fetcher, busy } = remover;
  return (
    <fetcher.Form method="post" className="max-w-full">
      <input type="hidden" name="intent" value="removeDiscount" />
      <input type="hidden" name="version" value={data.order.version} />
      <Button type="submit" variant="outline" disabled={busy} className="h-auto min-h-11 max-w-full whitespace-normal max-[22rem]:px-2">
        {busy ? t("admin.discount.removing") : t("admin.discount.remove")}
      </Button>
    </fetcher.Form>
  );
}

/**
 * The discount block by the order's total (S-320 AC1-AC5): the buttons while it can change, and
 * once paid a calm "locked" line instead. The money lines show here when no Items section shows
 * them (a custom request). It sits below the customer's contact buttons, so on a phone they
 * never move under the sticky action bar.
 */
export function OrderDiscount({ data, showLines }: { data: OrderLoaderData; showLines: boolean }) {
  const { t } = useI18n();
  const { order, allowed } = data;
  const [open, setOpen] = useState(false);
  const remover = useDiscountFetcher((intent) => intent === "removeDiscount" && showToast(t("admin.discount.removed")));
  const removeError = remover.answer && !remover.answer.ok && remover.answer.intent === "removeDiscount" ? remover.answer.error : null;
  const discount = order.discount;
  if (!discount && !allowed.discount) return null;
  const totalLabel = order.paid ? t("admin.discount.totalPaid") : t("admin.discount.totalToPay");
  return (
    <Section id="discount-heading" title={t("admin.discount.title")}>
      <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-lg bg-muted p-4 max-[22rem]:p-3" data-testid="order-discount">
        {discount && showLines && <DiscountLines discount={discount} totalRs={order.totalRs} totalLabel={totalLabel} />}
        {allowed.discount ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* At 320 px and 200% zoom the block is ~100 px wide: the words wrap and the icon steps aside. */}
            <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog" className="h-auto min-h-11 max-w-full whitespace-normal max-[22rem]:px-2">
              <BadgePercent aria-hidden="true" className="max-[22rem]:hidden" />
              {discount ? t("admin.discount.change") : t("admin.discount.add")}
            </Button>
            {discount && <RemoveButton data={data} remover={remover} />}
          </div>
        ) : (
          <p className="text-sm">{order.paid ? t("admin.discount.lockedPaid") : t("admin.discount.locked")}</p>
        )}
        {removeError && (
          <Alert tone="danger" role="alert">
            <p className="font-semibold">{removeError.message}</p>
            <a href={`/admin/orders/${order.id}`} className={orderLinkClass}>
              {t("admin.order.reload")}
            </a>
          </Alert>
        )}
        {/* Mounted only while open: a reopened dialog starts from what is saved now. */}
        {open && <DiscountDialog open={open} onClose={() => setOpen(false)} data={data} />}
      </div>
    </Section>
  );
}
