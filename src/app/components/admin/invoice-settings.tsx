import { BilingualField, SettingsSection } from "~/components/admin/settings-fields";
import { TextField } from "~/components/ui/text-field";
import { INVOICE_ADDRESS_MAX, INVOICE_NUMBER_MAX, INVOICE_TERMS_MAX, INVOICE_TEXT_MAX, INVOICE_THANKS_MAX } from "~/domain/invoice";
import { useI18n } from "~/i18n/react";
import type { OwnerInvoiceSettings } from "~/domain/invoice";

/** Field name -> element id, for the Settings error summary (S-127). */
export const INVOICE_ANCHORS: Record<string, string> = {
  invoiceLegalName: "invoice-legal-name",
  invoiceBrn: "invoice-brn",
  invoiceAddress: "invoice-address",
  invoicePhone: "invoice-phone",
  bankName: "bank-name",
  bankAccountName: "bank-account-name",
  bankAccountNumber: "bank-account-number",
  "invoicePaymentTerms.en": "invoice-terms-en",
  "invoicePaymentTerms.fr": "invoice-terms-fr",
  "invoiceThankYou.en": "invoice-thanks-en",
  "invoiceThankYou.fr": "invoice-thanks-fr",
  invoiceNextNumber: "invoice-next-number",
};

/**
 * Invoice (S-127, Owner only): what every invoice prints. The legal name, BRN and address also
 * fill the privacy note. The Juice number is the Payment section's, never typed twice.
 */
export function InvoiceSettingsSection({ invoice, errors }: { invoice: OwnerInvoiceSettings; errors: Record<string, string | undefined> }) {
  const { t } = useI18n();
  const optional = t("admin.product.optional");
  const plain = { optionalLabel: optional, autoComplete: "off" } as const;
  return (
    <SettingsSection id="invoice" title={t("admin.settings.invoiceTitle")} intro={t("admin.settings.invoiceIntro")}>
      <TextField id="invoice-legal-name" name="invoiceLegalName" label={t("admin.settings.invoiceLegalName")} maxLength={INVOICE_TEXT_MAX} defaultValue={invoice.legalName ?? ""} error={errors.invoiceLegalName} {...plain} />
      <TextField id="invoice-brn" name="invoiceBrn" label={t("admin.settings.invoiceBrn")} hint={t("admin.settings.invoiceBrnHint")} maxLength={20} autoCapitalize="characters" spellCheck={false} defaultValue={invoice.brn ?? ""} error={errors.invoiceBrn} className="max-w-sm" {...plain} />
      <TextField id="invoice-address" name="invoiceAddress" label={t("admin.settings.invoiceAddress")} multiline rows={3} maxLength={INVOICE_ADDRESS_MAX} defaultValue={invoice.address ?? ""} error={errors.invoiceAddress} {...plain} />
      <TextField id="invoice-phone" name="invoicePhone" type="tel" inputMode="tel" label={t("admin.settings.invoicePhone")} hint={t("admin.settings.phoneHint")} maxLength={20} defaultValue={invoice.phone ?? ""} error={errors.invoicePhone} className="max-w-sm" {...plain} />
      <TextField id="bank-name" name="bankName" label={t("admin.settings.bankName")} maxLength={INVOICE_TEXT_MAX} defaultValue={invoice.bankName ?? ""} error={errors.bankName} {...plain} />
      <TextField id="bank-account-name" name="bankAccountName" label={t("admin.settings.bankAccountName")} maxLength={INVOICE_TEXT_MAX} defaultValue={invoice.bankAccountName ?? ""} error={errors.bankAccountName} {...plain} />
      <TextField id="bank-account-number" name="bankAccountNumber" inputMode="numeric" label={t("admin.settings.bankAccountNumber")} hint={t("admin.settings.bankAccountNumberHint")} maxLength={30} spellCheck={false} defaultValue={invoice.bankAccountNumber ?? ""} error={errors.bankAccountNumber} className="max-w-sm" {...plain} />
      <BilingualField name="invoicePaymentTerms" id="invoice-terms" label={t("admin.settings.invoicePaymentTerms")} hint={t("admin.settings.invoicePaymentTermsHint")} max={INVOICE_TERMS_MAX} value={invoice.paymentTerms} multiline rows={3} errors={errors} />
      <BilingualField name="invoiceThankYou" id="invoice-thanks" label={t("admin.settings.invoiceThankYou")} max={INVOICE_THANKS_MAX} value={invoice.thankYou} errors={errors} />
      {/* The number loaded: the save writes the counter only when it was changed here (S-127). */}
      <input type="hidden" name="invoiceNextNumberWas" value={invoice.nextNumber} />
      <TextField id="invoice-next-number" name="invoiceNextNumber" label={t("admin.settings.invoiceNextNumber")} hint={t("admin.settings.invoiceNextNumberHint")} inputMode="numeric" pattern="[0-9]*" maxLength={String(INVOICE_NUMBER_MAX).length} autoComplete="off" defaultValue={invoice.nextNumber} error={errors.invoiceNextNumber} className="max-w-sm" />
    </SettingsSection>
  );
}
