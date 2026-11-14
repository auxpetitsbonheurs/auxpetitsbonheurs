import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formPayload, type OrderFormState } from "~/components/admin/order-form/model";
import { OrderForm } from "~/components/admin/order-form/order-form";
import { orderLinkClass } from "~/components/admin/order/header";
import { Alert } from "~/components/ui/alert";
import { showToast } from "~/components/ui/toaster";
import { noticeDaysFor } from "~/domain/availability";
import { manualOrderWarnings } from "~/domain/manual-order";
import { addDays, formatDayLabel } from "~/domain/time";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import type { OrderNewLoaderData } from "~/routes/admin/order-new";
import { CustomerMatch, useCustomerLookup } from "./customer-match";
import { ManualExtras } from "./manual-extras";

/** contracts `create`: 20 lines at most (S-131 AC7). */
export const MANUAL_LINES_MAX = 20;

type CreateAnswer = { ok: false; intent: "create"; error: { code: string; message: string; fields?: Record<string, string> }; names?: string[] };

function initialState(data: OrderNewLoaderData): OrderFormState {
  return {
    lines: [],
    fulfilment: { fulfilment: "pickup", date: data.today, windowId: data.windows.pickup[0]?.id ?? "", address: "", landmark: "", deliveryFeeRs: data.deliveryFeeRs },
    contact: { name: "", phone: "", email: "", note: "" },
    overrideTotalRs: null,
  };
}

/** The live warnings (S-134): the same rules `create` returns, worked out as the admin types. */
function Warnings({ data, state }: { data: OrderNewLoaderData; state: OrderFormState }) {
  const { t, locale } = useI18n();
  const products = new Map(data.menu.products.map((p) => [p.id, p]));
  const chosen = state.lines.flatMap((line) => (line.kind === "catalogue" ? [products.get(line.productId)] : [])).filter((p) => p !== undefined);
  const notice = noticeDaysFor(chosen.map((p) => ({ noticeDays: p.noticeDays })), data.availability.defaultNoticeDays);
  const soldOut = chosen.filter((p) => p.status === "sold_out").map((p) => p.name[locale] ?? p.name.en);
  const date = state.fulfilment.date;
  const warnings = /^\d{4}-\d{2}-\d{2}$/.test(date) ? manualOrderWarnings({ date, today: data.today, rules: data.availability, noticeDays: notice, soldOut: soldOut.length > 0 }) : [];
  const text = (warning: string) =>
    warning === "too_soon"
      ? t("admin.orderNew.warning.too_soon", { count: notice, earliest: formatDayLabel(addDays(data.today, notice), locale) })
      : warning === "sold_out"
        ? t("admin.orderNew.warning.sold_out", { names: soldOut.join(", ") })
        : t(`admin.orderNew.warning.${warning}`);
  return (
    <div role="status" aria-live="polite" className="mt-6">
      {warnings.length > 0 && (
        <Alert tone="warning" title={t("admin.orderNew.warningsTitle")} data-testid="manual-warnings">
          <ul className="grid gap-1">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="wrap-anywhere">{text(warning)}</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

/** Add order (S-131..S-135): the shared order form plus customer matching, Paid, language and the private note. */
export function ManualOrderPage({ data }: { data: OrderNewLoaderData }) {
  const { t } = useI18n();
  const fetcher = useFetcher<CreateAnswer>({ key: "manual-create" });
  const [state, setState] = useState(() => initialState(data));
  const [paid, setPaid] = useState(false);
  const [orderLocale, setOrderLocale] = useState<Locale>(data.locale);
  const [adminNote, setAdminNote] = useState("");
  const lookup = useCustomerLookup(state.contact);
  const answer = fetcher.state === "idle" ? fetcher.data : undefined;
  const formError =
    answer?.error.code === "PRODUCT_UNAVAILABLE" ? t("admin.orderNew.productUnavailable", { names: (answer.names ?? []).join(", ") }) : answer && !answer.error.fields ? answer.error.message : undefined;
  const errors = answer?.error.fields ?? {};
  const change = (next: OrderFormState) => {
    if (next.lines.length > MANUAL_LINES_MAX) {
      showToast(t("admin.orderNew.problem.tooMany"), "error");
      return;
    }
    setState(next);
  };
  const submit = () => {
    if (state.lines.length === 0) {
      showToast(t("admin.orderNew.empty"), "error");
      return;
    }
    const payload = { ...formPayload(state), idempotencyKey: data.idempotencyKey, locale: orderLocale, adminNote, paid };
    fetcher.submit({ intent: "create", payload: JSON.stringify(payload) }, { method: "post" });
  };
  return (
    <>
      <p>
        <a href="/admin/orders" className={orderLinkClass}>
          {t("admin.orderNew.back")}
        </a>
      </p>
      <h1 className="mt-2">{t("admin.orderNew.title")}</h1>
      {state.lines.length === 0 && <p className="mt-3 text-lg">{t("admin.orderNew.empty")}</p>}
      {answer && !answer.error.fields && answer.error.code !== "PRODUCT_UNAVAILABLE" && (
        <Alert tone="danger" role="alert" className="mt-6">
          <p className="font-semibold">{t("admin.orderNew.failed")}</p>
        </Alert>
      )}
      <OrderForm
        state={state}
        onChange={change}
        menu={data.menu}
        windows={data.windows}
        errors={errors}
        formError={formError}
        allowOverride={false}
        submitLabel={t("admin.orderNew.save")}
        pendingText={t("admin.orderNew.saving")}
        pending={fetcher.state !== "idle"}
        nowMs={data.nowMs}
        onSubmit={submit}
        extra={
          <>
            <CustomerMatch
              lookup={lookup}
              onUse={(customer) => {
                setState({ ...state, contact: { ...state.contact, name: customer.name } });
                setOrderLocale(customer.locale);
              }}
            />
            <ManualExtras paid={paid} onPaid={setPaid} locale={orderLocale} onLocale={setOrderLocale} adminNote={adminNote} onAdminNote={setAdminNote} />
          </>
        }
        beforeBar={<Warnings data={data} state={state} />}
      />
    </>
  );
}
