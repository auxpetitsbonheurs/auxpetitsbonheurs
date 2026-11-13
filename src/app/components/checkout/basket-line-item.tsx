import { CircleSlash, Info, Minus, Plus, Trash2 } from "lucide-react";
import { type ComponentProps, type FormEvent, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { PromoPrice } from "~/components/site/promo-price";
import { Button } from "~/components/ui/button";
import { type BasketLine, LINE_MAX_QUANTITY, LINE_MIN_QUANTITY } from "~/domain/basket";
import { useI18n } from "~/i18n/react";
import { basketStore } from "~/lib/basket-store";
import { useHydrated } from "~/lib/use-hydrated";
import { cn } from "~/lib/utils";

export interface BasketLineView {
  lineId: string;
  name: string;
  imageUrl: string | null;
  /** Chosen options and the cake message, in words ("8 inch", "Message on cake: Happy birthday"). */
  details?: string[];
  quantity: number;
  /** The product's minimum (1 when it has none): the stepper stops there. */
  minQuantity?: number;
  unitPrice: string;
  /** The unit price without the live offer, struck through (S-082); absent when none applies. */
  wasUnitPrice?: string | null;
  lineTotal: string;
  /** Sold out, hidden or deleted: shown dimmed with "No longer available", left out of the total. */
  unavailable: boolean;
  /** Left out because its options are no longer offered (S-066): "choose again" rather than "no longer available". */
  optionsChanged?: boolean;
  /** The product's name is unknown (deleted): `name` already says it is no longer available. */
  nameUnknown?: boolean;
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

/**
 * A stepper button at its limit. Before hydration it is `disabled` (a post would only be
 * refused). Once hydrated it is `aria-disabled` instead, so it stays focusable: a tap or
 * Enter changes nothing and shows the limit hint, tied to the button (UX audit M5).
 */
function LimitButton({ atLimit, hintId, onLimit, ...props }: ComponentProps<typeof Button> & { atLimit: boolean; hintId?: string; onLimit: () => void }) {
  const hydrated = useHydrated();
  const blocked = atLimit && hydrated;
  return (
    <Button
      {...props}
      type="submit"
      variant="outline"
      size="icon"
      name="quantity"
      disabled={atLimit && !hydrated}
      aria-disabled={blocked || undefined}
      aria-describedby={hintId}
      className="aria-disabled:opacity-50"
      onClick={(event) => {
        if (!blocked) return;
        event.preventDefault();
        onLimit();
      }}
    />
  );
}

/** Quantity stepper (design-system "Stepper", compact): every control is named after the product. */
function QuantityStepper({ line }: { line: BasketLineView }) {
  const { t } = useI18n();
  const { lineId, name, quantity } = line;
  const { fetcher, onSubmit } = useLineChange((event) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    basketStore.setQuantity(lineId, Number(submitter?.value));
  });
  // The limit hint shows only once a limit button was pressed (not on every 1-item line).
  const [hint, setHint] = useState<"min" | "max" | null>(null);
  const min = Math.max(LINE_MIN_QUANTITY, line.minQuantity ?? LINE_MIN_QUANTITY);
  const atMin = quantity <= min;
  const atMax = quantity >= LINE_MAX_QUANTITY;
  const shown = (hint === "min" && atMin) || (hint === "max" && atMax) ? hint : null;
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
          <LimitButton value={quantity - 1} atLimit={atMin} hintId={shown === "min" ? hintId : undefined} onLimit={() => setHint("min")} aria-label={t("basket.decrease", { name })}>
            <Minus aria-hidden="true" />
          </LimitButton>
          <output aria-live="polite" className="min-w-6 text-center text-lg font-semibold tabular-nums">
            {quantity}
          </output>
          <LimitButton value={quantity + 1} atLimit={atMax} hintId={shown === "max" ? hintId : undefined} onLimit={() => setHint("max")} aria-label={t("basket.increase", { name })}>
            <Plus aria-hidden="true" />
          </LimitButton>
        </div>
      </fetcher.Form>
      <p id={hintId} aria-live="polite" className="text-sm text-muted-foreground">
        {shown && (
          <span className="mt-1 inline-block">
            {shown === "max" ? t("basket.atMaximum") : min > LINE_MIN_QUANTITY ? t("basket.atProductMinimum", { min }) : t("basket.atMinimum")}
          </span>
        )}
      </p>
      {fetcher.data && !fetcher.data.ok && (
        <p role="alert" className="mt-1 font-semibold text-destructive">
          {fetcher.data.error.message}
        </p>
      )}
    </div>
  );
}

/** A line removed in the browser, kept so Undo can put it back where it was (UX audit M3). */
export interface RemovedLine {
  line: BasketLine;
  index: number;
  name: string;
}

function RemoveButton({ line, onRemoved }: { line: BasketLineView; onRemoved?: (removed: RemovedLine) => void }) {
  const { t } = useI18n();
  const { fetcher, onSubmit } = useLineChange(() => {
    const lines = basketStore.lines();
    const index = lines.findIndex((l) => l.lineId === line.lineId);
    basketStore.remove(line.lineId);
    const removed = lines[index];
    if (removed) onRemoved?.({ line: removed, index, name: line.name });
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
 * The line's live note (always mounted, polite): "No longer available. It will not be part
 * of your order." when the line turns unavailable (prefixed with the name for screen
 * readers, UX audit M2), else the price note.
 */
function LineNote({ line }: { line: BasketLineView }) {
  const { t } = useI18n();
  return (
    <p aria-live="polite" className="text-sm">
      {line.unavailable && (
        <span className="mt-1 flex items-start gap-1.5 text-base font-semibold">
          <CircleSlash aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>
            {!line.nameUnknown && <span className="sr-only">{line.name}: </span>}
            {t(line.nameUnknown ? "basket.notInOrder" : line.optionsChanged ? "basket.optionsChanged" : "basket.noLongerAvailable")}
          </span>
        </span>
      )}
      {line.priceNote && !line.unavailable && (
        // Calm but not missable (UX audit L1): icon + semibold, no warning colour.
        <span className="mt-1 flex items-start gap-1.5 font-semibold">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{line.priceNote}</span>
        </span>
      )}
    </p>
  );
}

/**
 * Basket line (design-system "Basket line"): photo, name, unit price, stepper, line price,
 * Remove. A price that changed carries one calm note, announced politely; an unavailable
 * line is dimmed (photo and prices; text keeps AA contrast), says it will not be part of the
 * order, and offers Remove only.
 */
export function BasketLineItem({ line, onRemoved }: { line: BasketLineView; onRemoved?: (removed: RemovedLine) => void }) {
  const { t } = useI18n();
  return (
    <li data-unavailable={line.unavailable || undefined} className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b py-4 last:border-b-0">
      {line.imageUrl && (
        <img src={line.imageUrl} alt="" width={56} height={56} className={cn("size-14 shrink-0 rounded-sm bg-decorative object-cover", line.unavailable && "opacity-40 grayscale")} />
      )}
      <div className="min-w-0 flex-1 basis-40">
        <p className={cn("font-semibold", line.unavailable && "text-muted-foreground")}>{line.name}</p>
        {line.details && line.details.length > 0 && (
          <ul className="text-sm wrap-anywhere">
            {line.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        {!line.unavailable && (
          <p className="text-sm text-muted-foreground">
            <PromoPrice price={t("basket.eachPrice", { price: line.unitPrice })} was={line.wasUnitPrice && t("basket.eachPrice", { price: line.wasUnitPrice })} />
          </p>
        )}
        <LineNote line={line} />
      </div>
      {!line.unavailable && (
        <p className="font-semibold whitespace-nowrap">
          <span className="sr-only">{t("basket.lineTotal")} </span>
          {line.lineTotal}
        </p>
      )}
      <div className="flex w-full flex-wrap items-start justify-between gap-3">
        {!line.unavailable && <QuantityStepper line={line} />}
        <RemoveButton line={line} onRemoved={onRemoved} />
      </div>
    </li>
  );
}
