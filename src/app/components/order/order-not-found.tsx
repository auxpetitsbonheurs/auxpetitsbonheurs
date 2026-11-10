import { MessageCircle } from "lucide-react";
import { useMatches } from "react-router";
import { useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";
import { localePath } from "~/lib/locale";

const link = "inline-flex min-h-11 items-center gap-2 font-semibold text-primary-strong underline underline-offset-4";

/** The bakery WhatsApp number from the site layout's loader, when Settings has one. */
function useBakeryWhatsapp(): string | null {
  for (const match of useMatches()) {
    const contacts = (match.loaderData as { contacts?: { whatsapp: string | null } } | undefined)?.contacts;
    if (contacts) return contacts.whatsapp;
  }
  return null;
}

/**
 * "We can't find this order" (FR-026): one body for every wrong, unknown or malformed
 * token, so a response never tells whether a token exists.
 */
export function OrderNotFound() {
  const { t, locale } = useI18n();
  const whatsapp = useBakeryWhatsapp();
  return (
    <>
      <h1>{t("order.notFound.title")}</h1>
      <p className="mt-4 max-w-measure">{t("order.notFound.body")}</p>
      <ul className="mt-6 grid gap-2">
        {whatsapp && (
          <li>
            <a href={whatsappHref(whatsapp)} className={link}>
              <MessageCircle aria-hidden="true" className="size-5" />
              {t("order.notFound.whatsapp")}
            </a>
          </li>
        )}
        <li>
          <a href={localePath(locale, "/")} className={link}>
            {t("errors.backHome")}
          </a>
        </li>
      </ul>
    </>
  );
}
