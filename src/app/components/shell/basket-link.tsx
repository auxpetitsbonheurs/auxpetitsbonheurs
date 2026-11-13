import { ShoppingBasket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { useI18n } from "~/i18n/react";
import { useBasketCount } from "~/lib/basket-store";

/**
 * True once the browser is idle after load (S-254): work that can wait (prefetching the basket's
 * code) then no longer competes with the page's own first paint on a slow phone connection.
 */
function useIdleAfterLoad(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const done = () => setIdle(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(done, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(done, 1500);
    return () => clearTimeout(timer);
  }, []);
  return idle;
}

/**
 * Header basket link (design-system "Basket button + count"). Its accessible name
 * carries the count ("Basket, 2 items"); a polite live region announces changes;
 * the badge bumps when the count changes after load, never under reduced motion. It sits
 * on the burgundy header band: cream icon, light-gold badge with burgundy text (6.8:1).
 */
export function BasketLink({ href, count: serverCount }: { href: string; count: number }) {
  const { t } = useI18n();
  // The server's count until hydration, then the browser basket's (ADR-0004: updates at once).
  const count = useBasketCount(serverCount);
  const [countAtLoad] = useState(count);
  const changed = count !== countAtLoad;
  const idle = useIdleAfterLoad();
  return (
    <>
      <Link
        to={href}
        // ADR-0004: load the basket's code ahead, so opening it needs no request at all (no
        // data is prefetched: the root and layout skip revalidation, the basket has a clientLoader).
        // Only once idle (S-254): the server HTML carries no basket modulepreloads.
        prefetch={idle ? "render" : "none"}
        aria-label={t("shell.basketLink", { count })}
        className="relative inline-flex size-11 items-center justify-center rounded-md text-current transition-colors duration-(--motion-fast) hover:text-link-hover"
      >
        <ShoppingBasket aria-hidden="true" className="size-6" strokeWidth={1.75} />
        {count > 0 && (
          <span
            key={count}
            data-basket-badge
            aria-hidden="true"
            className={cn(
              "absolute -end-1 -top-1 min-w-6 rounded-full bg-band-gold px-1.5 text-center text-sm leading-6 font-semibold text-band tabular-nums",
              changed && "animate-basket-bump",
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
      <p role="status" aria-live="polite" className="sr-only">
        {t("shell.basketStatus", { count })}
      </p>
    </>
  );
}
