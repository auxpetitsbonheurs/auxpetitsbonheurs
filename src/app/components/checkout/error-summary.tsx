import { type MouseEvent, forwardRef } from "react";
import { Alert } from "~/components/ui/alert";
import { useI18n } from "~/i18n/react";

/** Form field name -> the element the summary links to. */
const ANCHORS: Record<string, string> = {
  basket: "basket-heading",
  fulfilment: "fulfilment",
  address: "address",
  landmark: "landmark",
  date: "date",
  windowId: "windows",
  "contact.name": "contact-name",
  "contact.phone": "contact-phone",
  "contact.email": "contact-email",
  "contact.note": "contact-note",
  acceptPolicies: "acceptPolicies",
};

/**
 * Moves focus to the field without changing the URL: a hash change is a router
 * navigation, which would clear the refusal (and these errors) from the page.
 * Without JavaScript the plain anchor still scrolls to and focuses the field.
 */
function focusField(event: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById(event.currentTarget.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
}

export interface ErrorSummaryProps {
  message: string;
  detail?: string;
  fields?: Record<string, string>;
  /** Field name -> element id to link to; defaults to the checkout form's fields. */
  anchors?: Record<string, string>;
  title?: string;
}

/** Top-of-form Alert listing problems as links to their fields; takes focus (design-system "Checkout"). */
export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(function ErrorSummary({ message, detail, fields, anchors = ANCHORS, title }, ref) {
  const { t } = useI18n();
  const entries = Object.entries(fields ?? {});
  return (
    <Alert ref={ref} tone="danger" tabIndex={-1} role="alert" title={title ?? t("checkout.errorSummaryTitle")} className="mt-8 outline-offset-2" id="error-summary">
      <p>{message}</p>
      {detail && <p className="mt-1 font-semibold">{detail}</p>}
      {entries.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {entries.map(([field, text]) =>
            anchors[field] ? (
              <li key={field}>
                <a href={`#${anchors[field]}`} onClick={focusField} className="inline-flex min-h-11 items-center font-semibold link wrap-anywhere">
                  {text}
                </a>
              </li>
            ) : (
              <li key={field}>{text}</li>
            ),
          )}
        </ul>
      )}
    </Alert>
  );
});
