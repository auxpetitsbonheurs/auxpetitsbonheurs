import { MessageCircle, Phone } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { z } from "zod";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { StatusBadge } from "~/components/order/status-badge";
import { Button } from "~/components/ui/button";
import { isAnonymised } from "~/domain/customer-totals";
import { formatDayLabel } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { Uuid } from "~/server/contracts/shared";
import { requestDbContext } from "~/server/db.server";
import { findAdminCustomer, saveCustomerNote } from "~/server/repos/admin-customers.server";
import type { Route } from "./+types/customer";

/** `admin/customer` (`/admin/customers/:id`, S-176, S-177, FR-065): Admins and Owners; no edit or delete in v1. */
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
  };
}

const SaveNoteInput = z.object({ intent: z.literal("saveNote"), adminNote: z.string().default("") });

/** `saveNote { adminNote ≤ 2000 }` → `{ ok, intent, adminNote }`; blank clears; last write wins (S-177). */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const parsed = SaveNoteInput.safeParse(Object.fromEntries(await args.request.formData()));
  if (!parsed.success) return actionError("VALIDATION_FAILED", me.locale);
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

export default function AdminCustomer({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { customer, orders, orderCount, totalSpentRs } = loaderData;
  return (
    <>
      <p>
        <Link to="/admin/customers" className={linkClass}>
          {t("admin.customers.back")}
        </Link>
      </p>
      <h1 className="wrap-anywhere">{customer.name}</h1>
      <Contact customer={customer} orderCount={orderCount} totalSpentRs={totalSpentRs} />
      <PrivateNote key={customer.id} note={customer.adminNote} />
      <Orders orders={orders} />
    </>
  );
}
