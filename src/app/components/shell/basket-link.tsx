import { ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { useI18n } from "~/i18n/react";
import { useBasketCount } from "~/lib/basket-store";

/**
 * Header basket link (design-system "Basket button + count"). Its accessible name
 * carries the count ("Basket, 2 items"); a polite live region announces changes;
 * the badge bumps when the count changes after load, never under reduced motion.
 */
export function BasketLink({ href, count: serverCount }: { href: string; count: number }) {
  const { t } = useI18n();
  // The server's count until hydration, then the browser basket's (ADR-0004: updates at once).
  const count = useBasketCount(serverCount);
  const [countAtLoad] = useState(count);
  const changed = count !== countAtLoad;
  return (
    <>
      <Link
        to={href}
        aria-label={t("shell.basketLink", { count })}
        className="relative inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors duration-(--motion-fast) hover:bg-muted"
      >
        <ShoppingBasket aria-hidden="true" className="size-6" strokeWidth={1.75} />
        {count > 0 && (
          <span
            key={count}
            data-basket-badge
            aria-hidden="true"
            className={cn(
              "absolute -end-1 -top-1 min-w-6 rounded-full bg-primary px-1.5 text-center text-sm leading-6 font-semibold text-primary-foreground tabular-nums",
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
