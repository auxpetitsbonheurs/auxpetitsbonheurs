import { MessageCircle } from "lucide-react";
import { useLayoutWhatsapp } from "~/components/site/page-error";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";

/**
 * The ordering area of a sold-out product (S-065 AC4): "Sold out this week" in words, why,
 * and a WhatsApp button with a message about this product (when Settings has a number). No
 * options, no Add bar.
 */
export function SoldOutArea({ name, refusal }: { name: string; refusal?: string }) {
  const { t } = useI18n();
  const whatsapp = useLayoutWhatsapp();
  return (
    <div className="mt-6">
      {refusal && (
        <Alert tone="danger" role="alert" className="mb-6">
          <p>{refusal}</p>
        </Alert>
      )}
      <p className="inline-flex rounded-full border-2 border-foreground px-3 py-1 font-semibold">{t("productOptions.soldOutTitle")}</p>
      <p className="mt-3 max-w-measure">{t(whatsapp ? "productOptions.soldOutHint" : "productOptions.soldOutHintNoWhatsapp")}</p>
      {whatsapp && (
        <Button asChild variant="secondary" size="lg" className="mt-4 h-auto max-w-full shrink whitespace-normal wrap-anywhere">
          <a href={whatsappHref(whatsapp, t("productOptions.soldOutMessage", { name }))}>
            <MessageCircle aria-hidden="true" strokeWidth={1.75} />
            {t("productOptions.soldOutWhatsapp")}
          </a>
        </Button>
      )}
    </div>
  );
}
