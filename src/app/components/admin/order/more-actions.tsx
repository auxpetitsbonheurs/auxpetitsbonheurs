import { Ban, CircleCheck, CircleDashed, Undo2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderLoaderData } from "~/routes/admin/order";
import type { StatusIntent } from "./use-order-action";

export type ReasonIntent = "decline" | "cancel";
export const REASON_MAX = 500;

const itemClass = "h-auto min-h-12 w-full justify-start gap-3 whitespace-normal text-start";

function SheetItem({ icon, children, onClick, destructive, disabled }: { icon: ReactNode; children: ReactNode; onClick: () => void; destructive?: boolean; disabled: boolean }) {
  return (
    <li>
      <Button type="button" variant={destructive ? "destructive" : "outline"} className={itemClass} onClick={onClick} disabled={disabled}>
        {icon}
        {children}
      </Button>
    </li>
  );
}

/**
 * More actions (S-119 AC9): Refuse, Back one step, Mark paid/unpaid and Cancel, each a button with
 * its own name, offered only when `allowed` says so. Refuse and Cancel ask first.
 */
export function MoreActionsSheet(props: {
  open: boolean;
  onClose: () => void;
  data: OrderLoaderData;
  busy: boolean;
  onSubmit: (intent: StatusIntent, extra?: Record<string, string>) => void;
  onAsk: (intent: ReasonIntent) => void;
}) {
  const { t } = useI18n();
  const { order, allowed } = props.data;
  const canDecline = allowed.decline || allowed.declineRequest;
  const nothing = !canDecline && !allowed.revert && !allowed.setPaid && !allowed.cancel;
  return (
    <Modal open={props.open} onClose={props.onClose} title={t("admin.order.moreTitle", { number: order.number })} closeLabel={t("admin.states.close")}>
      {nothing && <p>{t("admin.order.noActions")}</p>}
      <ul className="grid gap-2">
        {canDecline && (
          <SheetItem icon={<X aria-hidden="true" />} onClick={() => props.onAsk("decline")} disabled={props.busy}>
            {t("admin.order.decline")}
          </SheetItem>
        )}
        {allowed.revert && (
          <SheetItem icon={<Undo2 aria-hidden="true" />} onClick={() => props.onSubmit("revert")} disabled={props.busy}>
            {t("admin.order.revert", { status: t(`admin.status.${allowed.revert}`) })}
          </SheetItem>
        )}
        {allowed.setPaid && (
          <SheetItem
            icon={order.paid ? <CircleDashed aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
            onClick={() => props.onSubmit("setPaid", { paid: String(!order.paid) })}
            disabled={props.busy}
          >
            {order.paid ? t("admin.order.flagUnpaid") : t("admin.order.flagPaid")}
          </SheetItem>
        )}
        {allowed.cancel && (
          <SheetItem icon={<Ban aria-hidden="true" />} onClick={() => props.onAsk("cancel")} destructive disabled={props.busy}>
            {t("admin.order.cancel")}
          </SheetItem>
        )}
      </ul>
    </Modal>
  );
}

function dialogText(t: ReturnType<typeof useI18n>["t"], intent: ReasonIntent | null, number: string) {
  return intent === "decline"
    ? { title: t("admin.order.declineTitle", { number }), body: null, label: t("admin.order.declineReason"), hint: t("admin.order.declineHint"), confirm: t("admin.order.declineYes", { number }), keep: t("admin.order.cancelStep") }
    : { title: t("admin.order.cancelTitle"), body: t("admin.order.cancelBody"), label: t("admin.order.reasonLabel"), hint: null, confirm: t("admin.order.confirmCancel", { number }), keep: t("admin.order.keep") };
}

/**
 * Refuse / Cancel confirmation (S-116 AC8, S-119 AC8, S-281): says the customer is emailed and, for
 * a paid order, that a refund will be due; the reason is optional, ≤ 500.
 */
export function ReasonDialog({ intent, onClose, data: { order }, onConfirm }: {
  intent: ReasonIntent | null;
  onClose: () => void;
  data: OrderLoaderData;
  onConfirm: (intent: ReasonIntent, reason: string) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const tooLong = reason.length > REASON_MAX;
  const text = dialogText(t, intent, order.number);
  const close = () => (setReason(""), onClose());
  const describedBy = [text.hint && "order-reason-hint", tooLong && "order-reason-error"].filter(Boolean).join(" ") || undefined;
  return (
    <Modal open={intent !== null} onClose={close} title={text.title} closeLabel={t("admin.states.close")} variant="dialog">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!intent || tooLong) return;
          onConfirm(intent, reason.trim());
          setReason("");
        }}
      >
        {text.body && <p>{text.body}</p>}
        {order.paid && (
          <Alert tone="warning" className="mt-3">
            <p>{intent === "decline" ? t("admin.order.declinePaidNote", { amount: formatRupees(order.totalRs) }) : t("admin.order.cancelPaid", { amount: formatRupees(order.totalRs) })}</p>
          </Alert>
        )}
        <label htmlFor="order-reason" className="mt-4 block font-semibold">
          {text.label}
        </label>
        {text.hint && (
          <p id="order-reason-hint" className="text-sm text-muted-foreground">
            {text.hint}
          </p>
        )}
        <textarea
          id="order-reason"
          name="reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={tooLong || undefined}
          aria-describedby={describedBy}
          className="mt-2 block min-h-24 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive"
        />
        {tooLong && (
          <p id="order-reason-error" className="mt-1 font-semibold text-destructive">
            {t("admin.order.reasonTooLong")}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={close} className="h-auto min-h-11 flex-1 whitespace-normal">
            {text.keep}
          </Button>
          <Button type="submit" variant="destructive" className="h-auto min-h-11 flex-1 whitespace-normal">
            {text.confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
