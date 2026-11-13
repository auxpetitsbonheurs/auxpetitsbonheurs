import { Menu, UserRound } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { MENU_LINKS_PATH, type SiteNavItem } from "~/lib/site-nav";
import { useHydrated } from "~/lib/use-hydrated";
import { SiteNavLinks } from "./site-nav";

const triggerClass =
  "inline-flex size-11 items-center justify-center rounded-md text-current transition-colors duration-(--motion-fast) hover:text-link-hover";

/**
 * Lucide's "x" drawn inline: importing it would make it a chunk shared with the admin app and
 * add bytes to the product editor's route, which is at its JS budget.
 */
function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="size-6">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** Focusable elements inside the panel, first to last (for the Tab wrap). */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
}

/** After a navigation chosen in the menu: focus the new page's h1 (or the main landmark). */
function focusPageStart() {
  const target = document.querySelector<HTMLElement>("#main h1") ?? document.getElementById("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: false });
}

/**
 * Phone site menu (S-243): a 44 px three-line button after the basket, below 1024 px. It opens
 * a full-screen burgundy panel, a native modal `<dialog>`: the page behind is inert and does
 * not scroll (app.css), Esc closes it, Tab and Shift+Tab wrap inside it, and focus returns to
 * the button on close. Choosing another page closes it and focuses that page's h1.
 *
 * Progressive enhancement (AC8): before hydration, or without JavaScript, the button is a link
 * to `/menu-links` (the same 7 links on a plain page), never a dead button. The panel is
 * server-rendered markup reusing the nav list, about 1 kB: no chunk to fetch on first press
 * (AC5's budget aim, with an instant open instead of a lazy load).
 */
export function SiteMenu({ account }: { account?: { href: string; signedIn: boolean } } = {}) {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const navigated = useRef(false);
  const titleId = useId();
  const panelId = useId();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!navigated.current) return;
    navigated.current = false;
    focusPageStart();
  }, [pathname]);

  if (!hydrated) {
    return (
      <Link to={localePath(locale, MENU_LINKS_PATH)} aria-label={t("nav.menuButton")} className={triggerClass}>
        <Menu aria-hidden="true" className="size-6" strokeWidth={1.75} />
      </Link>
    );
  }

  const close = () => dialog.current?.close();
  const open = () => {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    setExpanded(true);
    closeButton.current?.focus();
  };
  const choose = (event: MouseEvent<HTMLAnchorElement>, _item: SiteNavItem, current: boolean) => {
    if (current) event.preventDefault();
    else navigated.current = true;
    close();
  };
  const wrapTab = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || !dialog.current) return;
    const items = focusables(dialog.current);
    const [first, last] = [items[0], items[items.length - 1]];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t("nav.menuButton")}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={open}
        className={triggerClass}
        data-site-menu-button
      >
        <Menu aria-hidden="true" className="size-6" strokeWidth={1.75} />
      </button>
      <dialog
        ref={dialog}
        id={panelId}
        aria-labelledby={titleId}
        data-site-menu
        onKeyDown={wrapTab}
        onClose={() => {
          setExpanded(false);
          if (!navigated.current) trigger.current?.focus();
        }}
        className="band fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 p-0 backdrop:bg-band"
      >
        <div className="mx-auto flex min-h-full max-w-content flex-col px-4 pt-2 pb-8">
          <div className="flex items-center justify-between gap-4 border-b border-gold pb-2">
            <h2 id={titleId} className="text-2xl">
              {t("nav.menuTitle")}
            </h2>
            <button type="button" onClick={close} aria-label={t("nav.closeMenu")} className={triggerClass} ref={closeButton}>
              <CloseIcon />
            </button>
          </div>
          <nav aria-labelledby={titleId} className="mt-6">
            <SiteNavLinks variant="panel" onChoose={choose} />
          </nav>
          {account && (
            // E-11: the account (or Sign in) row below the 7 site links, apart from them.
            <p className="mt-6 border-t border-gold pt-4">
              <Link
                to={account.href}
                onClick={() => {
                  navigated.current = true;
                  close();
                }}
                className="inline-flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-xl text-current hover:text-link-hover"
              >
                <UserRound aria-hidden="true" className="size-6" strokeWidth={1.75} />
                {t(account.signedIn ? "nav.account" : "nav.signIn")}
              </Link>
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
