// "Pay now to confirm your order" (S-278, juice-payment spec): the Juice payment of an order
// awaiting it, on the confirmation and tracking pages. Copy-friendly: each value is selectable
// text, and once hydrated each has a Copy button whose result is announced once (polite).
// Without the account details (Owner has not set them) a calm info Alert replaces the card.
import { MessageCircle } from "lucide-react";
import { CopyButton, CopyStatus, useCopyStatus } from "~/components/order/copy-actions";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { useHydrated } from "~/lib/use-hydrated";

export interface PaymentInstructionsView {
  totalRs: number;
  reference: string;
  deadline: string;
  deadlineLabel: string;
  details: { juiceName: string; juiceNumber: string } | null;
  proofUrl: string | null;
}

interface CopyRowProps {
  term: string;
  value: string;
  /** What is copied (digits only for the amount and the number, as Juice expects them). */
  copyText: string;
  copyLabel: string;
  copiedText: string;
  copy?: (text: string, done: string) => void;
  status: string;
}

function CopyRow({ term, value, copyText, copyLabel, copiedText, copy, status }: CopyRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-input py-3 last:border-b-0">
      <p className="min-w-0">
        <span className="block text-sm">{term}</span>
        {/* Body font with lining, tabular digits: a number to type must never be misread. */}
        <span className="block text-2xl font-semibold tabular-nums wrap-anywhere select-all">{value}</span>
      </p>
      {copy && <CopyButton label={copyLabel} copied={status === copiedText} onCopy={() => copy(copyText, copiedText)} />}
    </li>
  );
}

const digits = (text: string) => text.replace(/\D/g, "");

function PaymentCard({ view, details }: { view: PaymentInstructionsView; details: NonNullable<PaymentInstructionsView["details"]> }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const { status, copy } = useCopyStatus();
  const amount = formatRupees(view.totalRs);
  const vars = { amount, name: details.juiceName, number: details.juiceNumber, reference: view.reference };
  const onCopy = hydrated ? (text: string, done: string) => void copy(text, done) : undefined;
  return (
    <section aria-labelledby="pay-heading" data-testid="payment-instructions" className="mt-6 rounded-card border-2 border-warning bg-card p-4 sm:p-5">
      <h2 id="pay-heading" className="text-h2">
        {t("order.payment.title")}
      </h2>
      <p className="mt-2 max-w-measure text-lg">{t("order.payment.lead", vars)}</p>
      <ul className="mt-3">
        <CopyRow term={t("order.payment.amount")} value={amount} copyText={String(view.totalRs)} copyLabel={t("order.payment.copyAmount")} copiedText={t("order.payment.copiedAmount")} copy={onCopy} status={status} />
        <CopyRow term={t("order.payment.juiceNumber")} value={details.juiceNumber} copyText={digits(details.juiceNumber)} copyLabel={t("order.payment.copyNumber")} copiedText={t("order.payment.copiedNumber")} copy={onCopy} status={status} />
        <li className="border-b border-input py-3">
          <span className="block text-sm">{t("order.payment.name")}</span>
          <span className="block text-lg font-semibold wrap-anywhere">{details.juiceName}</span>
        </li>
        <CopyRow term={t("order.payment.reference")} value={view.reference} copyText={view.reference} copyLabel={t("order.payment.copyReference")} copiedText={t("order.payment.copiedReference")} copy={onCopy} status={status} />
      </ul>
      <h3 className="mt-4 text-lg">{t("order.payment.stepsTitle")}</h3>
      <ol className="mt-2 grid list-decimal gap-1 ps-6">
        <li>{t("order.payment.step1", vars)}</li>
        <li>{t("order.payment.step2", vars)}</li>
        <li>{view.proofUrl ? t("order.payment.step3") : t("order.payment.step3NoWhatsapp")}</li>
      </ol>
      <p className="mt-3 max-w-measure font-semibold">
        {t("order.payment.deadline", { time: view.deadlineLabel })} <time dateTime={view.deadline} className="sr-only">{view.deadline}</time>
      </p>
      {view.proofUrl && (
        <a href={view.proofUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg", className: "mt-4 w-full max-w-full sm:w-auto" })}>
          <MessageCircle aria-hidden="true" />
          {t("order.payment.sendProof")}
          <span className="sr-only"> {t("order.payment.opensWhatsapp")}</span>
        </a>
      )}
      <CopyStatus status={status} />
    </section>
  );
}

export function PaymentInstructions({ view }: { view: PaymentInstructionsView }) {
  const { t } = useI18n();
  if (!view.details) {
    return (
      <Alert tone="info" title={t("order.payment.fallbackTitle")} className="mt-6" data-testid="payment-fallback">
        <p>{t("order.payment.fallbackBody", { amount: formatRupees(view.totalRs), reference: view.reference })}</p>
        <p className="mt-1">{t("order.payment.deadline", { time: view.deadlineLabel })}</p>
      </Alert>
    );
  }
  return <PaymentCard view={view} details={view.details} />;
}
