// Account email re-exports and the Juice payment block. The layout and every template now live
// in ./templates (S-188); this module keeps the E-02 import path working.
import { t } from "~/i18n/catalog.server";
import { type Locale, formatRupees } from "~/lib/locale";
import { authEmail } from "./templates/auth-emails";
import { BAKERY_NAME, type RenderedEmail, escapeHtml } from "./templates/layout";

export { BAKERY_NAME, type RenderedEmail };
export { RECOVERY_LINK_MINUTES, type CustomerAuthEmail, type InvitationDetails, customerAuthEmail, invitationEmail } from "./templates/auth-emails";

/** What the payment block needs: the confirmation page's PaymentView (S-278 AC8). */
export interface EmailPayment {
  totalRs: number;
  reference: string;
  deadlineLabel: string;
  details: { juiceName: string; juiceNumber: string } | null;
  proofUrl: string | null;
}

/**
 * The Juice payment block of the `order_received` email (S-278 AC8): the same words and steps
 * as the confirmation page, or the calm fallback while the Owner has not entered the details.
 * E-10 renders the whole email; this block is its payment part, escaped, inline-styled.
 */
export function paymentBlock(locale: Locale, payment: EmailPayment): { html: string; text: string } {
  const amount = formatRupees(payment.totalRs);
  const deadline = t("order.payment.deadline", locale, { time: payment.deadlineLabel });
  if (!payment.details) {
    const lines = [t("email.payment.fallback", locale), t("order.payment.fallbackBody", locale, { amount, reference: payment.reference }), deadline];
    return { html: lines.map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join("\n"), text: lines.join("\n") };
  }
  const vars = { amount, name: payment.details.juiceName, number: payment.details.juiceNumber, reference: payment.reference };
  const steps = [t("order.payment.step1", locale, vars), t("order.payment.step2", locale, vars), payment.proofUrl ? t("order.payment.step3", locale) : t("order.payment.step3NoWhatsapp", locale)];
  const heading = t("email.payment.heading", locale);
  const lead = t("order.payment.lead", locale, vars);
  const button = payment.proofUrl
    ? `<p style="margin:0 0 12px"><a href="${escapeHtml(payment.proofUrl)}" style="display:block;box-sizing:border-box;min-height:44px;padding:13px 20px;background:#660c0c;color:#fcead8;font-size:16px;line-height:1.3;text-align:center;text-decoration:none;border-radius:8px;font-weight:bold">${escapeHtml(t("order.payment.sendProof", locale))}</a></p>`
    : "";
  const html = [
    `<h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(heading)}</h2>`,
    `<p style="margin:0 0 12px">${escapeHtml(lead)}</p>`,
    `<ol style="margin:0 0 12px;padding-left:20px">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`,
    `<p style="margin:0 0 12px;font-weight:bold">${escapeHtml(deadline)}</p>`,
    button,
  ].join("\n");
  const text = [heading, lead, ...steps.map((step, i) => `${i + 1}. ${step}`), deadline, ...(payment.proofUrl ? [payment.proofUrl] : [])].join("\n");
  return { html, text };
}

/** The password reset email (S-024 AC1, AC4, AC7). */
export function recoveryEmail(locale: Locale, link: string): RenderedEmail {
  return authEmail("password_reset", locale, link);
}
