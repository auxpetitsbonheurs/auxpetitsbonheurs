import { Minus, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { LINE_MAX_QUANTITY, LINE_MIN_QUANTITY } from "~/domain/basket";
import { useI18n } from "~/i18n/react";
import { basketStore } from "~/lib/basket-store";
import { cn } from "~/lib/utils";

export interface BasketLineView {
  lineId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  /** Sold out, hidden or deleted: shown dimmed with "No longer available", left out of the total. */
  unavailable: boolean;
  /** "Price updated from Rs X to Rs Y" when the menu price changed since it was shown, else null. */
  priceNote: string | null;
}

type LineActionData = { ok: false; error: { message: string } } | undefined;

/**
 * With JavaScript the change happens in the browser (ADR-0004: no network call); the form
 * post stays for a page without JavaScript and for a basket cookie the script cannot write
 * (an old HttpOnly one): the server answers and re-sets it.
 */
function useLineChange(change: (event: FormEvent<HTMLFormElement>) => void) {
  const fetcher = useFetcher<LineActionData>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data === undefined) return;
    if (fetcher.state === "idle") basketStore.refresh();
  }, [fetcher.state, fetcher.data]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    try {
      change(event);
      event.preventDefault();
    } catch {
      // Not writable here: let the fetcher post it.
    }
  };
  return { fetcher, onSubmit };
}

/** Moves focus to the basket heading (the removed line's controls are gone). */
function focusBasket() {
  requestAnimationFrame(() => (document.getElementById("basket-heading") ?? document.getElementById("main"))?.focus());
}

/** Quantity stepper (design-system "Stepper", compact): every control is named after the product. */
function QuantityStepper({ line }: { line: BasketLineView }) {
  const { t } = useI18n();
  const { lineId, name, quantity } = line;
  const { fetcher, onSubmit } = useLineChange((event) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    basketStore.setQuantity(lineId, Number(submitter?.value));
  });
  const atMin = quantity <= LINE_MIN_QUANTITY;
  const atMax = quantity >= LINE_MAX_QUANTITY;
  const hintId = `quantity-hint-${lineId}`;
  return (
    <div>
      <fetcher.Form method="post" preventScrollReset onSubmit={onSubmit}>
        <input type="hidden" name="intent" value="updateLine" />
        <input type="hidden" name="lineId" value={lineId} />
        <div role="group" aria-label={t("basket.quantityOf", { name })} className="flex flex-wrap items-center gap-1">
          <span className="text-sm" aria-hidden="true">
            {t("basket.quantity")}
          </span>
          <Button type="submit" variant="outline" size="icon" name="quantity" value={quantity - 1} disabled={atMin} aria-label={t("basket.decrease", { name })}>
            <Minus aria-hidden="true" />
          </Button>
          <output aria-live="polite" className="min-w-6 text-center text-lg font-semibold tabular-nums">
            {quantity}
          </output>
          <Button type="submit" variant="outline" size="icon" name="quantity" value={quantity + 1} disabled={atMax} aria-label={t("basket.increase", { name })}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </fetcher.Form>
      {(atMin || atMax) && (
        <p id={hintId} className="mt-1 text-sm text-muted-foreground">
          {t(atMin ? "basket.atMinimum" : "basket.atMaximum")}
        </p>
      )}
      {fetcher.data && !fetcher.data.ok && (
        <p role="alert" className="mt-1 font-semibold text-destructive">
          {fetcher.data.error.message}
        </p>
      )}
    </div>
  );
}

function RemoveButton({ line }: { line: BasketLineView }) {
  const { t } = useI18n();
  const { fetcher, onSubmit } = useLineChange(() => {
    basketStore.remove(line.lineId);
    focusBasket();
  });
  return (
    <fetcher.Form method="post" preventScrollReset onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="removeLine" />
      <input type="hidden" name="lineId" value={line.lineId} />
      <Button type="submit" variant="ghost" aria-label={t("basket.remove", { name: line.name })}>
        <Trash2 aria-hidden="true" />
        {t("basket.removeLabel")}
      </Button>
    </fetcher.Form>
  );
}

/**
 * Basket line (design-system "Basket line"): photo, name, unit price, stepper, line price,
 * Remove. A price that changed carries one calm note, announced politely; an unavailable
 * line is dimmed (photo and prices; text keeps AA contrast), says so, and offers Remove only.
 */
export function BasketLineItem({ line }: { line: BasketLineView }) {
  const { t } = useI18n();
  return (
    <li data-unavailable={line.unavailable || undefined} className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b py-4 last:border-b-0">
      {line.imageUrl && (
        <img src={line.imageUrl} alt="" width={56} height={56} className={cn("size-14 shrink-0 rounded-sm bg-decorative object-cover", line.unavailable && "opacity-40 grayscale")} />
      )}
      <div className="min-w-0 flex-1 basis-40">
        <p className={cn("font-semibold", line.unavailable && "text-muted-foreground")}>{line.name}</p>
        {!line.unavailable && <p className="text-sm text-muted-foreground">{t("basket.eachPrice", { price: line.unitPrice })}</p>}
        {line.unavailable && <p className="mt-1 font-semibold">{t("basket.noLongerAvailable")}</p>}
        <p aria-live="polite" className="text-sm">
          {line.priceNote && !line.unavailable && <span className="mt-1 inline-block">{line.priceNote}</span>}
        </p>
      </div>
      {!line.unavailable && (
        <p className="font-semibold whitespace-nowrap">
          <span className="sr-only">{t("basket.lineTotal")} </span>
          {line.lineTotal}
        </p>
      )}
      <div className="flex w-full flex-wrap items-start justify-between gap-3">
        {line.unavailable ? <span /> : <QuantityStepper line={line} />}
        <RemoveButton line={line} />
      </div>
    </li>
  );
}
