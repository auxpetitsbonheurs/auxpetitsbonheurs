import { ClipboardList, Lock, LockOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { OrderRow } from "~/components/admin/orders/order-row";
import { listLinkClass } from "~/components/admin/orders/types";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { useI18n } from "~/i18n/react";
import type { CalendarLoaderData, CalendarOrderView } from "~/routes/admin/calendar";
import { CalendarUndoToast, type UndoMessage } from "./undo-toast";
import { DayState } from "./week-view";

type Day = CalendarLoaderData["days"][number];
type Answer =
  | { ok: true; intent: "blockDay"; date: string; existingOrders: CalendarOrderView[] }
  | { ok: true; intent: "unblockDay"; date: string }
  | { ok: false; intent: string; error: { code: string; message: string; fields?: Record<string, string> } };

let nextMessageId = 1;

/** The confirm dialog's order list (number, name, window): S-138 AC2. */
function OrderBriefs({ orders }: { orders: CalendarOrderView[] }) {
  return (
    <ul className="grid gap-1">
      {orders.map((order) => (
        <li key={order.id} className="wrap-anywhere">
          <span className="font-semibold">{order.number}</span> · {order.contactName} · {order.window.start}–{order.window.end}
        </li>
      ))}
    </ul>
  );
}

/** Block / Reopen answers become a toast with Undo (the opposite action, 6 s); refusals an inline Alert. */
function useBlockActions(day: Day) {
  const { t } = useI18n();
  const fetcher = useFetcher<Answer>({ key: `calendar-day-${day.date}` });
  const undoFetcher = useFetcher<Answer>({ key: `calendar-undo-${day.date}` });
  const [message, setMessage] = useState<UndoMessage | null>(null);
  const reason = useRef(day.blockReason);
  const seen = useRef<Answer | undefined>(undefined);
  const seenUndo = useRef<Answer | undefined>(undefined);
  useEffect(() => {
    const answer = fetcher.data;
    if (fetcher.state !== "idle" || !answer || seen.current === answer || !answer.ok) return;
    seen.current = answer;
    const blocked = answer.intent === "blockDay";
    const opposite: Record<string, string> = blocked ? { intent: "unblockDay", date: day.date } : { intent: "blockDay", date: day.date, reason: reason.current ?? "" };
    setMessage({
      id: nextMessageId++,
      tone: "success",
      text: t(blocked ? "admin.calendar.dayBlocked" : "admin.calendar.dayReopened"),
      undo: { label: t("admin.calendar.undo"), name: t(blocked ? "admin.calendar.undoBlockNamed" : "admin.calendar.undoReopenNamed", { date: day.longLabel }), run: () => undoFetcher.submit(opposite, { method: "post" }) },
    });
  }, [fetcher.state, fetcher.data, day, t, undoFetcher]);
  useEffect(() => {
    const answer = undoFetcher.data;
    if (undoFetcher.state !== "idle" || !answer || seenUndo.current === answer) return;
    seenUndo.current = answer;
    setMessage({ id: nextMessageId++, tone: answer.ok ? "success" : "error", text: t(answer.ok ? "admin.calendar.undone" : "admin.calendar.undoFailed") });
  }, [undoFetcher.state, undoFetcher.data, t]);
  useEffect(() => {
    if (day.blockReason !== null) reason.current = day.blockReason;
  }, [day.blockReason]);
  /** The reason a block was made with, so Undo of a later Reopen restores it. */
  const remember = useCallback((text: string) => {
    reason.current = text;
  }, []);
  const done = useCallback((id: number) => setMessage((current) => (current?.id === id ? null : current)), []);
  const refusal = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;
  return { fetcher, message, done, refusal, remember };
}

function RangeNote({ role }: { role: CalendarLoaderData["role"] }) {
  const { t } = useI18n();
  if (role !== "owner") return <p className="font-semibold">{t("admin.calendar.rangeAdmin")}</p>;
  return (
    <p>
      {t("admin.calendar.rangeOwner")}{" "}
      <a href="/admin/availability" className={listLinkClass}>
        {t("admin.calendar.openAvailability")}
      </a>
    </p>
  );
}

function BlockForm({ day, data, orders, actions }: { day: Day; data: CalendarLoaderData; orders: CalendarOrderView[]; actions: ReturnType<typeof useBlockActions> }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const pending = actions.fetcher.state !== "idle";
  const block = () => {
    setConfirming(false);
    actions.remember(reason);
    actions.fetcher.submit({ intent: "blockDay", date: day.date, reason }, { method: "post" });
  };
  return (
    <form
      method="post"
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (orders.length > 0) setConfirming(true);
        else block();
      }}
    >
      <input type="hidden" name="intent" value="blockDay" />
      <input type="hidden" name="date" value={day.date} />
      <TextField
        id="block-reason"
        name="reason"
        label={t("admin.calendar.reasonLabel")}
        optionalLabel={t("admin.calendar.optional")}
        hint={t("admin.calendar.reasonHint", { count: reason.length, max: data.reasonMax })}
        error={actions.refusal?.fields?.reason}
        multiline
        rows={2}
        maxLength={data.reasonMax}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <SubmitButton pending={pending} pendingText={t("admin.calendar.blocking")} size="lg" className="w-full sm:w-auto">
        <Lock aria-hidden="true" />
        {t("admin.calendar.blockDay")}
      </SubmitButton>
      <Modal open={confirming} onClose={() => setConfirming(false)} title={t("admin.calendar.confirmTitle", { date: day.longLabel })} closeLabel={t("admin.calendar.close")} variant="dialog" role="alertdialog">
        <p className="mb-3">{t("admin.calendar.confirmText")}</p>
        <OrderBriefs orders={orders} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => setConfirming(false)}>
            {t("admin.calendar.keepOpen")}
          </Button>
          <Button type="button" size="lg" onClick={block}>
            {t("admin.calendar.confirmBlock")}
          </Button>
        </div>
      </Modal>
    </form>
  );
}

function DayActions({ day, data, orders, actions }: { day: Day; data: CalendarLoaderData; orders: CalendarOrderView[]; actions: ReturnType<typeof useBlockActions> }) {
  const { t } = useI18n();
  if (day.closedDay) return <p>{t("admin.calendar.closedDayNote")}</p>;
  if (day.blockKind === "range") return <RangeNote role={data.role} />;
  if (day.date < data.today) return day.blocked ? null : <p>{t("admin.calendar.pastNote")}</p>;
  if (day.blocked) {
    const pending = actions.fetcher.state !== "idle";
    return (
      <actions.fetcher.Form method="post">
        <input type="hidden" name="intent" value="unblockDay" />
        <input type="hidden" name="date" value={day.date} />
        <SubmitButton pending={pending} pendingText={t("admin.calendar.reopening")} size="lg" variant="outline" className="w-full sm:w-auto">
          <LockOpen aria-hidden="true" />
          {t("admin.calendar.reopenDay")}
        </SubmitButton>
      </actions.fetcher.Form>
    );
  }
  return <BlockForm day={day} data={data} orders={orders} actions={actions} />;
}

/** Day view (S-137, S-138): the day's state, Block / Reopen, the prep list link and its orders. */
export function DayView({ data }: { data: CalendarLoaderData }) {
  const { t } = useI18n();
  const day = data.days[0]!;
  const orders = data.list;
  const actions = useBlockActions(day);
  return (
    <div className="mt-4 grid gap-5">
      <section aria-labelledby="day-state" className="grid gap-3 rounded-card border border-border bg-card p-3">
        <h3 id="day-state" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {t("admin.calendar.dayStateTitle")}
          {day.date === data.today && <span className="text-sm">{t("admin.calendar.todayWord")}</span>}
          <DayState day={day} />
        </h3>
        {day.blockReason && <p className="wrap-anywhere">{t("admin.calendar.blockedReason", { reason: day.blockReason })}</p>}
        {actions.refusal && !actions.refusal.fields?.reason && (
          <Alert tone="danger" role="alert">
            <p className="font-semibold">{actions.refusal.code === "FORBIDDEN" ? t("admin.calendar.rangeAdmin") : (actions.refusal.fields?.date ?? actions.refusal.message)}</p>
          </Alert>
        )}
        <DayActions day={day} data={data} orders={orders} actions={actions} />
      </section>
      <a href={`/admin/calendar/${day.date}/prep`} className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-input bg-card px-3 font-semibold hover:bg-accent sm:w-fit">
        <ClipboardList aria-hidden="true" className="size-5" />
        {t("admin.calendar.prepList")}
      </a>
      {day.blocked && orders.length > 0 && (
        <Alert tone="warning">
          <p className="font-semibold">{t("admin.calendar.reminderTitle")}</p>
          <p>{t("admin.calendar.confirmText")}</p>
        </Alert>
      )}
      <section aria-labelledby="day-orders">
        <h3 id="day-orders" className="text-lg font-semibold">
          {t("admin.calendar.dayOrders", { count: orders.length })}
        </h3>
        {orders.length === 0 ? (
          <p className="mt-2 text-lg">{t("admin.calendar.emptyDay")}</p>
        ) : (
          <ul className="mt-2 grid gap-3" aria-labelledby="day-orders">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
        )}
        {data.more && <p className="mt-2">{t("admin.calendar.dayTooBusy")}</p>}
      </section>
      <CalendarUndoToast message={actions.message} onDone={actions.done} />
    </div>
  );
}
