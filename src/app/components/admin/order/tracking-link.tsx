import { Check, Copy } from "lucide-react";
import { useCopyStatus, useHydrated } from "~/components/order/copy-actions";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";

/**
 * The customer's tracking link on the order screen (E-07 S-135 AC2): a manual order without an
 * email gets no confirmation, so the admin can copy the link and send it by WhatsApp. The link is
 * shown as text (selectable before JavaScript); Copy appears once hydrated and wraps at 200% zoom.
 */
export function TrackingLink({ url }: { url: string }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const { status, copy } = useCopyStatus();
  const copied = status === t("admin.orderNew.trackingCopied");
  return (
    <section aria-labelledby="tracking-link-heading" className="mt-6 grid gap-2 rounded-card border border-border bg-card p-3">
      <h2 id="tracking-link-heading" className="text-lg font-semibold">
        {t("admin.orderNew.trackingTitle")}
      </h2>
      <p className="text-sm">{t("admin.orderNew.trackingHint")}</p>
      <p className="font-mono text-sm wrap-anywhere" data-testid="tracking-url">
        {url}
      </p>
      {hydrated && (
        <Button type="button" variant="outline" onClick={() => void copy(url, t("admin.orderNew.trackingCopied"))} className="h-auto max-w-full whitespace-normal wrap-anywhere sm:w-fit">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {t("admin.orderNew.copyTracking")}
        </Button>
      )}
      <p role="status" className="text-sm">
        {status}
      </p>
    </section>
  );
}
