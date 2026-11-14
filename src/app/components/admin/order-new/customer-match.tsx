import { LoaderCircle, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormContact } from "~/components/admin/order-form/model";
import { Button } from "~/components/ui/button";
import { normalizePhone } from "~/domain/phone";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";

export interface FoundCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  locale: Locale;
  orderCount: number;
}

export type Lookup =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "failed" }
  | { state: "found"; customer: FoundCustomer; conflict: boolean; key: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Wait this long after the last keystroke before searching (one lookup per pause, not per key). */
const PAUSE_MS = 600;

/**
 * Looks the customer up by phone and/or email once the typing pauses on a usable value (S-133):
 * `POST /admin/customer-lookup` with `fetch`, so a failure only shows "Could not search, you can
 * still continue." and never blocks Save (AC8). No match shows nothing.
 */
export function useCustomerLookup(contact: FormContact): Lookup {
  const phone = normalizePhone(contact.phone) ? contact.phone.trim() : "";
  const email = EMAIL.test(contact.email.trim()) ? contact.email.trim() : "";
  const key = `${phone}|${email}`;
  // Each result belongs to the inputs it was searched for: a stale answer is never shown.
  const [result, setResult] = useState<{ key: string; lookup: Lookup }>({ key: "|", lookup: { state: "idle" } });
  useEffect(() => {
    if (key === "|") return;
    let live = true;
    const timer = setTimeout(async () => {
      setResult({ key, lookup: { state: "searching" } });
      try {
        const response = await fetch("/admin/customer-lookup", { method: "POST", body: new URLSearchParams({ phone, email }), headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(String(response.status));
        const answer = (await response.json()) as { ok: true; customer: FoundCustomer | null; conflict: boolean };
        if (live) setResult({ key, lookup: answer.customer ? { state: "found", customer: answer.customer, conflict: answer.conflict, key } : { state: "idle" } });
      } catch {
        if (live) setResult({ key, lookup: { state: "failed" } });
      }
    }, PAUSE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, phone, email]);
  return key !== "|" && result.key === key ? result.lookup : { state: "idle" };
}

/** The match card in a polite status region (S-133 AC1, AC4, AC5, AC10). */
export function CustomerMatch({ lookup, onUse }: { lookup: Lookup; onUse: (customer: FoundCustomer) => void }) {
  const { t } = useI18n();
  const [used, setUsed] = useState<string | null>(null);
  return (
    <div role="status" aria-live="polite" className="mt-3">
      {lookup.state === "searching" && (
        <p className="flex items-center gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          {t("admin.orderNew.lookup.searching")}
        </p>
      )}
      {lookup.state === "failed" && <p className="text-sm font-semibold">{t("admin.orderNew.lookup.failed")}</p>}
      {lookup.state === "found" && (
        <div className="grid gap-2 rounded-card border-2 border-info bg-card p-3" data-testid="customer-match">
          <p className="flex items-start gap-2 font-semibold wrap-anywhere">
            <UserCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t("admin.orderNew.lookup.found", { name: lookup.customer.name, count: lookup.customer.orderCount })}
          </p>
          {lookup.conflict && <p className="text-sm">{t("admin.orderNew.lookup.conflict")}</p>}
          <p className="text-sm">{t("admin.orderNew.lookup.reused")}</p>
          {used === lookup.key ? (
            <p className="text-sm font-semibold">{t("admin.orderNew.lookup.used")}</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="sm:w-fit"
              onClick={() => {
                setUsed(lookup.key);
                onUse(lookup.customer);
              }}
            >
              {t("admin.orderNew.lookup.use")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
