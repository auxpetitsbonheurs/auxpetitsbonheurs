import { MessageCircle, RotateCw } from "lucide-react";
import { useRevalidator, useRouteLoaderData } from "react-router";
import type { FooterContacts } from "~/components/shell/site-footer";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";

/** The footer's WhatsApp number (site layout loader), for links in states where the page has no data. */
export function useLayoutWhatsapp(): string | null {
  const { locale } = useI18n();
  const layout = useRouteLoaderData(`site-${locale}`) as { contacts?: FooterContacts } | undefined;
  return layout?.contacts?.whatsapp ?? null;
}

/**
 * A content page could not load (S-251 AC7, S-252 AC6; reusable by S-248..S-250): the page's
 * `h1`, a calm alert with Retry and, when Settings has one, WhatsApp. The frame stays.
 */
export function SitePageError({ title }: { title: string }) {
  const { t } = useI18n();
  const whatsapp = useLayoutWhatsapp();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== "idle";
  return (
    <>
      <h1 className="text-center">{title}</h1>
      <Alert tone="danger" role="alert" title={t("sitePage.errorTitle")} className="mx-auto mt-8 max-w-measure">
        <p>{t("sitePage.errorBody")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void revalidator.revalidate()} aria-busy={retrying || undefined} disabled={retrying}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} className={retrying ? "motion-safe:animate-spin" : undefined} />
            {t("sitePage.retry")}
          </Button>
          {whatsapp && (
            <Button asChild variant="secondary">
              <a href={whatsappHref(whatsapp)}>
                <MessageCircle aria-hidden="true" strokeWidth={1.75} />
                {t("sitePage.whatsapp")}
              </a>
            </Button>
          )}
        </div>
      </Alert>
    </>
  );
}
