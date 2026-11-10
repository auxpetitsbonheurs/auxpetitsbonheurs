import { Mail, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "~/i18n/react";
import { mailHref, telHref, whatsappHref } from "~/lib/contact";

export interface FooterContacts {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  pickupAddress: string | null;
}

interface ContactLinkProps {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  /** Phone numbers stay on one line; emails may break anywhere at narrow widths. */
  keepTogether?: boolean;
}

function ContactLink({ href, icon, label, value, keepTogether = false }: ContactLinkProps) {
  return (
    <li>
      <a
        href={href}
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md px-2 py-2 link wrap-anywhere"
      >
        {icon}
        <span>
          {label} <span className={keepTogether ? "whitespace-nowrap" : undefined}>{value}</span>
        </span>
      </a>
    </li>
  );
}

const iconProps = { "aria-hidden": true, className: "size-5", strokeWidth: 1.75 } as const;

/** Centred footer (brand D4): wordmark, contacts, pickup; items with an empty Settings value are omitted (catalogue spec). */
export function SiteFooter({ contacts, year }: { contacts: FooterContacts; year: string }) {
  const { t } = useI18n();
  const { whatsapp, phone, email, pickupAddress } = contacts;
  const hasContacts = Boolean(whatsapp || phone || email);
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col items-center px-4 py-8 text-center md:px-6">
        <p className="font-display text-xl text-foreground">{t("shell.bakeryName")}</p>
        {hasContacts && (
          <>
            <h2 className="mt-4 text-xl">{t("shell.footer.heading")}</h2>
            <ul className="mt-2 flex flex-col items-center gap-1 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6">
              {whatsapp && (
                <ContactLink href={whatsappHref(whatsapp)} icon={<MessageCircle {...iconProps} />} label={t("shell.footer.whatsapp")} value={whatsapp} keepTogether />
              )}
              {phone && <ContactLink href={telHref(phone)} icon={<Phone {...iconProps} />} label={t("shell.footer.phone")} value={phone} keepTogether />}
              {email && <ContactLink href={mailHref(email)} icon={<Mail {...iconProps} />} label={t("shell.footer.email")} value={email} />}
            </ul>
          </>
        )}
        {pickupAddress && <p className="mt-4 text-muted-foreground">{t("shell.footer.pickup", { address: pickupAddress })}</p>}
        <p className="mt-6 text-sm text-muted-foreground">{t("shell.footer.copyright", { year })}</p>
      </div>
    </footer>
  );
}
