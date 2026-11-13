// Order detail > WhatsApp menu (S-203 AC1, AC2, AC5, AC7, AC8): the button opens a menu of the
// five templates, already resolved server-side in the order's language as wa.me links, so a tap
// opens WhatsApp at once with the message prefilled (the admin edits it there; the app records
// nothing about what is sent). Keyboard: Enter/Space opens, arrows move, Home/End jump, Escape
// closes and returns focus to the button. No phone: the button stays visible, disabled, with the
// reason in words (never colour alone). A tap also posts `whatsappLink` for the counter (S-201 AC9).
import { ChevronDown, MessageCircle } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useI18n } from "~/i18n/react";

export interface WhatsappMenuItem {
  key: string;
  label: string;
  url: string;
}

const buttonClass = "inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border-2 border-input bg-card px-4 text-left font-semibold hover:bg-accent";

export function WhatsappMenu({ items, name, orderId, hintId }: { items: WhatsappMenuItem[] | null; name: string; orderId: string; hintId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const menuId = useId();
  const counter = useFetcher({ key: `whatsapp-link-${orderId}` });

  useEffect(() => {
    if (open) links.current[0]?.focus();
  }, [open]);

  if (!items) {
    return (
      <button type="button" aria-disabled="true" aria-describedby={hintId} className={`${buttonClass} cursor-not-allowed opacity-60`}>
        <MessageCircle aria-hidden="true" className="size-5" />
        {t("admin.order.whatsappName", { name })}
      </button>
    );
  }

  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  };
  const move = (event: KeyboardEvent<HTMLUListElement>) => {
    const current = links.current.findIndex((link) => link === document.activeElement);
    const last = items.length - 1;
    const next = { ArrowDown: current >= last ? 0 : current + 1, ArrowUp: current <= 0 ? last : current - 1, Home: 0, End: last }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      links.current[next]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };
  const opened = (key: string) => {
    void counter.submit({ intent: "whatsappLink", template: key }, { method: "post", action: `/admin/orders/${orderId}` });
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 max-w-full">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonClass}
      >
        <MessageCircle aria-hidden="true" className="size-5" />
        <span className="min-w-0 wrap-anywhere">{t("admin.order.whatsappName", { name })}</span>
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-md border-2 border-input bg-card p-1 shadow-lg">
          <p className="px-3 py-2 text-sm">{t("admin.order.whatsappMenuHint")}</p>
          <ul id={menuId} role="menu" aria-label={t("admin.order.whatsappMenuLabel", { name })} onKeyDown={move}>
            {items.map((item, index) => (
              <li key={item.key} role="none">
                <a
                  ref={(node) => void (links.current[index] = node)}
                  role="menuitem"
                  tabIndex={-1}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => opened(item.key)}
                  className="flex min-h-11 items-center rounded-sm px-3 font-semibold hover:bg-accent focus-visible:bg-accent"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
