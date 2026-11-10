import { Minus, Plus, Trash2 } from "lucide-react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { LINE_MAX_QUANTITY, LINE_MIN_QUANTITY } from "~/domain/basket";
import { useI18n } from "~/i18n/react";

export interface BasketLineView {
  lineId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  /** Localised reason the line cannot be ordered, or null. */
  problem: string | null;
}

type LineActionData = { ok: false; error: { message: string } } | undefined;

/** Quantity stepper (design-system "Stepper", compact): every control is named after the product. */
function QuantityStepper({ line }: { line: BasketLineView }) {
  const { t } = useI18n();
  const fetcher = useFetcher<LineActionData>();
  const { lineId, name, quantity } = line;
  const atMin = quantity <= LINE_MIN_QUANTITY;
  const atMax = quantity >= LINE_MAX_QUANTITY;
  const hintId = `quantity-hint-${lineId}`;
  return (
    <div>
      <fetcher.Form method="post" preventScrollReset>
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
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" preventScrollReset>
      <input type="hidden" name="intent" value="removeLine" />
      <input type="hidden" name="lineId" value={line.lineId} />
      <Button type="submit" variant="ghost" aria-label={t("basket.remove", { name: line.name })}>
        <Trash2 aria-hidden="true" />
        {t("basket.removeLabel")}
      </Button>
    </fetcher.Form>
  );
}

/** Basket line (design-system "Basket line"): photo, name, unit price, stepper, line price, Remove. */
export function BasketLineItem({ line }: { line: BasketLineView }) {
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b py-4 last:border-b-0">
      {line.imageUrl && (
        <img src={line.imageUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded-md bg-muted object-cover" />
      )}
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-semibold">{line.name}</p>
        <p className="text-sm text-muted-foreground">{t("basket.eachPrice", { price: line.unitPrice })}</p>
        {line.problem && <p className="mt-1 font-semibold text-destructive">{line.problem}</p>}
      </div>
      <p className="font-semibold whitespace-nowrap">
        <span className="sr-only">{t("basket.lineTotal")} </span>
        {line.lineTotal}
      </p>
      <div className="flex w-full flex-wrap items-start justify-between gap-3">
        <QuantityStepper line={line} />
        <RemoveButton line={line} />
      </div>
    </li>
  );
}
