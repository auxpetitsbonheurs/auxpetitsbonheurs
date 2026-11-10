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
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full py-2 pe-3 text-primary-strong underline underline-offset-4 wrap-anywhere"
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

/** Footer band (muted); items with an empty Settings value are omitted (catalogue spec). */
export function SiteFooter({ contacts, year }: { contacts: FooterContacts; year: string }) {
  const { t } = useI18n();
  const { whatsapp, phone, email, pickupAddress } = contacts;
  const hasContacts = Boolean(whatsapp || phone || email);
  return (
    <footer className="bg-muted">
      <div className="mx-auto max-w-content px-4 py-8 md:px-6">
        {hasContacts && (
          <>
            <h2 className="text-xl font-semibold">{t("shell.footer.heading")}</h2>
            <ul className="mt-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {whatsapp && (
                <ContactLink href={whatsappHref(whatsapp)} icon={<MessageCircle {...iconProps} />} label={t("shell.footer.whatsapp")} value={whatsapp} keepTogether />
              )}
              {phone && <ContactLink href={telHref(phone)} icon={<Phone {...iconProps} />} label={t("shell.footer.phone")} value={phone} keepTogether />}
              {email && <ContactLink href={mailHref(email)} icon={<Mail {...iconProps} />} label={t("shell.footer.email")} value={email} />}
            </ul>
          </>
        )}
        {pickupAddress && <p className="mt-4">{t("shell.footer.pickup", { address: pickupAddress })}</p>}
        <p className="mt-6 text-sm text-muted-foreground">{t("shell.footer.copyright", { year })}</p>
      </div>
    </footer>
  );
}
