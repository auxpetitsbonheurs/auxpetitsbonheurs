import { MessageCircle, Phone } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link, data, isRouteErrorResponse, useFetcher, useRouteError } from "react-router";
import { z } from "zod";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { StatusBadge } from "~/components/order/status-badge";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { showToast } from "~/components/ui/toaster";
import { useAnswer } from "~/components/admin/team-person";
import { isAnonymised } from "~/domain/customer-totals";
import { formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { actionError } from "~/server/action-result.server";
import { type AdminUser, requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { Uuid } from "~/server/contracts/shared";
import { requestDbContext } from "~/server/db.server";
import { findAdminCustomer, saveCustomerNote } from "~/server/repos/admin-customers.server";
import { FINISHED_ORDER_STATUSES, anonymiseCustomer } from "~/server/services/anonymise-customer.server";
import { userAdminContext } from "~/server/user-admin.server";
import type { Route } from "./+types/customer";

/**
 * `admin/customer` (`/admin/customers/:id`, S-176, S-177, FR-065): Admins and Owners; no edit in
 * v1. Owners also get "Anonymise customer" (PRV-02, S-229 AC6): confirm first, idempotent.
 */
export const handle = { titleKey: "admin.nav.customers" };

export const NOTE_MAX = 2000;

function notFound(): never {
  throw data(null, { status: 404 });
}

/** Call and WhatsApp for a usable E.164 number (S-176 AC1); none for an anonymised customer. */
function contactLinks(phone: string | null) {
  const usable = phone !== null && /^\+\d{8,15}$/.test(phone);
  return { telUrl: usable ? `tel:${phone}` : null, whatsappUrl: usable ? `https://wa.me/${phone.slice(1)}` : null };
}

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  if (!Uuid.safeParse(args.params.id).success) notFound();
  const found = await findAdminCustomer(args.context.get(requestDbContext).db, args.params.id);
  if (!found) notFound();
  const deleted = isAnonymised(found.customer);
  const phone = deleted ? null : found.customer.phone;
  return {
    title: deleted ? translate("admin.customers.deleted", me.locale) : found.customer.name,
    customer: {
      ...found.customer,
      name: deleted ? translate("admin.customers.deleted", me.locale) : found.customer.name,
      phone,
      email: deleted ? null : found.customer.email,
      deleted,
      ...contactLinks(phone),
    },
    orders: found.orders.map((order) => ({ ...order, dateLabel: formatDayLabel(order.fulfilOn, me.locale) })),
    orderCount: found.orderCount,
    totalSpentRs: found.totalSpentRs,
    anonymisedLabel: found.customer.anonymisedAt ? formatDayLabel(todayMU(found.customer.anonymisedAt), me.locale) : null,
    anonymise: {
      allowed: me.role === "owner" && !deleted,
      openOrders: found.orders.filter((order) => !(FINISHED_ORDER_STATUSES as readonly string[]).includes(order.status)).length,
    },
  };
}

const ActionInput = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("saveNote"), adminNote: z.string().default("") }),
  z.object({ intent: z.literal("anonymise") }),
]);

/**
 * `anonymise {}` (Owner only) → `{ ok, intent, outcome: "anonymised" | "already" }`; open orders
 * 409 INVALID_TRANSITION with the count; Auth not answering 502 INTERNAL, nothing changed (PRV-02).
 */
async function anonymiseAction(args: Route.ActionArgs, me: AdminUser) {
  const id = args.params.id;
  if (!Uuid.safeParse(id).success) return actionError("NOT_FOUND", me.locale, { extra: { intent: "anonymise" as const } });
  const context = { db: args.context.get(requestDbContext).db, users: args.context.get(userAdminContext), now: args.context.get(clockContext).now() };
  const result = await anonymiseCustomer(context, id);
  // Ids and the outcome only, never the customer's data (NFR-004).
  console.log(JSON.stringify({ level: "info", event: "customer_anonymise", customerId: id, actorRole: me.role, result: result.ok ? result.outcome : result.code }));
  if (result.ok) return { ok: true as const, intent: "anonymise" as const, outcome: result.outcome };
  if (result.code === "NOT_FOUND") return actionError("NOT_FOUND", me.locale, { extra: { intent: "anonymise" as const } });
  const refusal = (code: "INVALID_TRANSITION" | "INTERNAL", message: string, status: number) =>
    data({ ok: false as const, intent: "anonymise" as const, error: { code, message } }, { status });
  if (result.code === "OPEN_ORDERS") return refusal("INVALID_TRANSITION", translate("admin.customers.anonymiseOpenOrders", me.locale, { count: result.openOrders }), 409);
  return refusal("INTERNAL", translate("admin.customers.anonymiseAuthFailed", me.locale), 502);
}

/** `saveNote { adminNote ≤ 2000 }` → `{ ok, intent, adminNote }`; blank clears; last write wins (S-177). */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const parsed = ActionInput.safeParse(Object.fromEntries(await args.request.formData()));
  if (!parsed.success) return actionError("VALIDATION_FAILED", me.locale);
  if (parsed.data.intent === "anonymise") {
    if (me.role !== "owner") return actionError("FORBIDDEN", me.locale, { extra: { intent: "anonymise" as const } });
    return anonymiseAction(args, me);
  }
  const note = parsed.data.adminNote.trim() === "" ? null : parsed.data.adminNote;
  if (note !== null && note.length > NOTE_MAX) {
    return actionError("VALIDATION_FAILED", me.locale, { fields: { adminNote: translate("admin.customers.noteTooLong", me.locale, { max: NOTE_MAX }) } });
  }
  const id = args.params.id;
  if (!Uuid.safeParse(id).success || !(await saveCustomerNote(args.context.get(requestDbContext).db, id, note))) return actionError("NOT_FOUND", me.locale);
  // Never the note itself (S-177 AC3, NFR-004).
  console.log(JSON.stringify({ level: "info", event: "customer_note_saved", customerId: id, actorRole: me.role }));
  return { ok: true as const, intent: "saveNote" as const, adminNote: note };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

/** 404 reads "Customer not found" with a way back (S-176 AC4); everything else is the admin boundary (Retry). */
export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  const error = useRouteError();
  if (!isRouteErrorResponse(error) || error.status !== 404) return <AdminErrorBoundary error={props.error} />;
  return (
    <>
      <h1>{t("admin.customers.notFoundTitle")}</h1>
      <p className="mt-3">{t("admin.customers.notFoundBody")}</p>
      <p className="mt-6">
        <Link to="/admin/customers" className="inline-flex min-h-11 items-center font-semibold link">
          {t("admin.customers.back")}
        </Link>
      </p>
    </>
  );
}

type LoaderData = Route.ComponentProps["loaderData"];

const linkClass = "inline-flex min-h-11 items-center font-semibold link";

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold">{term}:</dt>
      <dd className="min-w-0 wrap-anywhere tabular-nums">{children}</dd>
    </div>
  );
}

function Contact({ customer, orderCount, totalSpentRs }: Pick<LoaderData, "customer" | "orderCount" | "totalSpentRs">) {
  const { t } = useI18n();
  const contact = "inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-input bg-card px-4 font-semibold";
  return (
    <>
      <dl className="mt-4 grid gap-1">
        {customer.phone && <Fact term={t("admin.customers.phone")}>{customer.phone}</Fact>}
        {customer.email && <Fact term={t("admin.customers.email")}>{customer.email}</Fact>}
        <Fact term={t("admin.customers.language")}>{t(`admin.customers.languageName.${customer.locale}`)}</Fact>
        <Fact term={t("admin.customers.account")}>{customer.hasAccount ? t("admin.customers.yes") : t("admin.customers.no")}</Fact>
        <Fact term={t("admin.customers.orders")}>{orderCount}</Fact>
        <Fact term={t("admin.customers.spent")}>{formatRupees(totalSpentRs)}</Fact>
      </dl>
      {(customer.telUrl || customer.whatsappUrl) && (
        <p className="mt-4 flex flex-wrap gap-3">
          {customer.telUrl && (
            <a href={customer.telUrl} className={contact}>
              <Phone aria-hidden="true" className="size-5" />
              {t("admin.customers.call", { name: customer.name })}
            </a>
          )}
          {customer.whatsappUrl && (
            <a href={customer.whatsappUrl} target="_blank" rel="noopener noreferrer" className={contact}>
              <MessageCircle aria-hidden="true" className="size-5" />
              {t("admin.customers.whatsapp", { name: customer.name })}
            </a>
          )}
        </p>
      )}
    </>
  );
}

/** Private note (S-177 AC7): visible label, live counter, explicit Save, "Saved" in a status; text kept on failure. */
function PrivateNote({ note }: { note: string | null }) {
  const { t } = useI18n();
  const [text, setText] = useState(note ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const id = useId();
  const busy = status === "saving";
  const over = text.length > NOTE_MAX;
  const problem = over ? t("admin.customers.noteTooLong", { max: NOTE_MAX }) : status === "failed" ? t("admin.customers.saveFailed") : null;
  /**
   * Posted with fetch, not a fetcher: a failed save (offline, 500, signed out) must stay on this
   * page with the typed text and a message (S-177 AC5), never swap in the error page. Without
   * JavaScript the form posts normally and the page reloads with the saved note.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || over) return;
    setStatus("saving");
    try {
      const response = await fetch(window.location.pathname, { method: "POST", body: new FormData(event.currentTarget), redirect: "manual" });
      setStatus(response.ok ? "saved" : "failed");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8">
      <form method="post" onSubmit={onSubmit}>
        <input type="hidden" name="intent" value="saveNote" />
        <label htmlFor={`${id}-note`} id={`${id}-heading`} className="block text-h2">
          {t("admin.customers.noteLabel")}
        </label>
        <p id={`${id}-help`} className="mt-1 text-muted-foreground">
          {t("admin.customers.noteHelp")}
        </p>
        <textarea
          id={`${id}-note`}
          name="adminNote"
          rows={4}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setStatus("idle");
          }}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-help ${id}-count${problem ? ` ${id}-error` : ""}`}
          className="mt-2 block w-full min-w-0 rounded-md border-2 border-input bg-background p-3 text-base"
        />
        <p id={`${id}-count`} aria-live="polite" className={cn("mt-1 text-sm", over && "font-semibold text-destructive")}>
          {t("admin.customers.noteCount", { count: text.length, max: NOTE_MAX })}
        </p>
        {problem && (
          <p id={`${id}-error`} role="alert" className="mt-1 font-semibold text-destructive">
            {problem}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={over} aria-busy={busy || undefined}>
            {busy ? t("admin.customers.saving") : t("admin.customers.save")}
          </Button>
          <p role="status" className="font-semibold">
            {status === "saved" ? t("admin.customers.saved") : ""}
          </p>
        </div>
      </form>
    </section>
  );
}

function Orders({ orders }: { orders: LoaderData["orders"] }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="customer-orders" className="mt-8">
      <h2 id="customer-orders" className="text-h2">
        {t("admin.customers.ordersTitle")}
      </h2>
      {orders.length === 0 ? (
        <p className="mt-2">{t("admin.customers.noOrders")}</p>
      ) : (
        <ul className="mt-3 grid gap-3" aria-labelledby="customer-orders">
          {orders.map((order) => (
            <li key={order.id} className="min-w-0 rounded-card border border-border bg-card px-2 py-2 min-[20rem]:px-4">
              <Link to={`/admin/orders/${order.id}`} className={cn(linkClass, "wrap-anywhere")}>
                {t("admin.customers.orderLink", { number: order.number, date: order.dateLabel, amount: formatRupees(order.totalRs) })}
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
                <StatusBadge status={order.status} audience="admin" />
                <span className="wrap-anywhere">{t("admin.customers.orderedAs", { name: order.contactName })}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type AnonymiseAnswer =
  | { ok: true; intent: "anonymise"; outcome: "anonymised" | "already" }
  | { ok: false; intent?: string; error: { code: string; message: string } };

/**
 * Owner only (PRV-02): what it removes and what stays, then a confirm dialog that names the
 * customer. The button shows its pending state at once; success is a toast and the page reloads
 * as "Deleted customer"; a refusal stays in the dialog (role=alert) and in an error toast. With
 * open orders the section says to finish them first instead of offering the button.
 */
function AnonymiseSection({ name, openOrders }: { name: string; openOrders: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const fetcher = useFetcher<AnonymiseAnswer>({ key: "customer-anonymise" });
  const pending = fetcher.state !== "idle";
  const close = () => {
    setRefused(null);
    setOpen(false);
  };
  // Success is announced by the page (useAnonymisedToast): the reloaded page no longer has this section.
  useAnswer(fetcher, (answer) => {
    if (answer.ok) return close();
    setRefused(answer.error.message);
    showToast(answer.error.message, "error");
  });
  return (
    <section aria-labelledby="customer-anonymise" className="mt-10 border-t border-border pt-6">
      <h2 id="customer-anonymise" className="text-h2">
        {t("admin.customers.anonymiseTitle")}
      </h2>
      <p className="mt-2">{t("admin.customers.anonymiseHelp")}</p>
      {openOrders > 0 ? (
        <p className="mt-3 font-semibold">{t("admin.customers.anonymiseOpen", { count: openOrders })}</p>
      ) : (
        <Button type="button" variant="outline" className="mt-3 h-auto whitespace-normal" onClick={() => setOpen(true)}>
          {t("admin.customers.anonymiseButton")}
        </Button>
      )}
      <Modal open={open} onClose={close} title={t("admin.customers.anonymiseConfirmTitle", { name })} closeLabel={t("admin.states.close")} variant="dialog">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="anonymise" />
          <p className="wrap-anywhere">{t("admin.customers.anonymiseConfirmBody")}</p>
          {refused && !pending && (
            <p role="alert" className="mt-2 font-semibold text-destructive">
              {refused}
            </p>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-auto whitespace-normal" onClick={close}>
              {t("admin.customers.anonymiseCancel")}
            </Button>
            <SubmitButton pending={pending} pendingText={t("admin.customers.anonymising")} variant="destructive" className="h-auto whitespace-normal">
              {t("admin.customers.anonymiseConfirm")}
            </SubmitButton>
          </div>
        </fetcher.Form>
      </Modal>
    </section>
  );
}

/** The success toast, from the page that stays mounted while the section disappears (same keyed fetcher). */
function useAnonymisedToast() {
  const { t } = useI18n();
  const fetcher = useFetcher<AnonymiseAnswer>({ key: "customer-anonymise" });
  useAnswer(fetcher, (answer) => {
    if (answer.ok) showToast(t("admin.customers.anonymised"));
  });
}

export default function AdminCustomer({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { customer, orders, orderCount, totalSpentRs, anonymise, anonymisedLabel } = loaderData;
  useAnonymisedToast();
  return (
    <>
      <p>
        <Link to="/admin/customers" className={linkClass}>
          {t("admin.customers.back")}
        </Link>
      </p>
      <h1 className="wrap-anywhere">{customer.name}</h1>
      {anonymisedLabel && <p className="mt-2">{t("admin.customers.anonymisedOn", { date: anonymisedLabel })}</p>}
      <Contact customer={customer} orderCount={orderCount} totalSpentRs={totalSpentRs} />
      {!customer.deleted && <PrivateNote key={customer.id} note={customer.adminNote} />}
      <Orders orders={orders} />
      {anonymise.allowed && <AnonymiseSection name={customer.name} openOrders={anonymise.openOrders} />}
    </>
  );
}
