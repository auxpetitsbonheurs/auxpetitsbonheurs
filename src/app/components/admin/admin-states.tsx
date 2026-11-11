import { useEffect, useRef } from "react";
import { Link, isRouteErrorResponse, useRevalidator } from "react-router";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";

/**
 * Page heading that takes focus on arrival, so screen readers announce where the admin
 * landed. It is not a control (tabIndex -1, never in the Tab order), so it shows no ring.
 */
function FocusedHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1} className="outline-none">
      {children}
    </h1>
  );
}

function BackToToday() {
  const { t } = useI18n();
  return (
    <p className="mt-6">
      <Link to="/admin" className="inline-flex min-h-11 items-center font-semibold link">
        {t("admin.states.backToToday")}
      </Link>
    </p>
  );
}

/** "Owner only" empty state (design-system: Owner-only screens), shown with HTTP 403 (S-022 AC1). */
export function OwnerOnly() {
  const { t } = useI18n();
  return (
    <>
      <FocusedHeading>{t("admin.states.ownerOnlyTitle")}</FocusedHeading>
      <p className="mt-3 max-w-measure">{t("admin.states.ownerOnlyBody")}</p>
      <BackToToday />
    </>
  );
}

/** Neutral page for a destination a later epic builds (S-033 AC7): not an error, never a dead end. */
export function NotAvailableYet({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <>
      <FocusedHeading>{title}</FocusedHeading>
      <p className="mt-3 font-semibold">{t("admin.states.notYetTitle")}</p>
      <p className="mt-1 max-w-measure">{t("admin.states.notYetBody")}</p>
      <BackToToday />
    </>
  );
}

/**
 * ErrorBoundary for admin pages, rendered inside the frame: 403 is the Owner-only state,
 * 404 the not-found text, anything else says what happened and offers Retry.
 */
export function AdminErrorBoundary({ error }: { error: unknown }) {
  const { t } = useI18n();
  const revalidator = useRevalidator();
  if (isRouteErrorResponse(error) && error.status === 403) return <OwnerOnly />;
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <FocusedHeading>{t(notFound ? "errors.notFoundTitle" : "errors.genericTitle")}</FocusedHeading>
      <p className="mt-3 max-w-measure">{t(notFound ? "errors.notFoundBody" : "errors.genericBody")}</p>
      {!notFound && (
        <p className="mt-6">
          <Button type="button" variant="outline" onClick={() => void revalidator.revalidate()}>
            {t("admin.states.retry")}
          </Button>
        </p>
      )}
      <BackToToday />
    </>
  );
}
