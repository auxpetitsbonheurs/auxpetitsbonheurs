import { Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import type { Menu } from "~/domain/menu";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { FormSection } from "./fields";
import { FreeTextSheet } from "./free-text-sheet";
import { type FormLine, QUANTITY_MAX } from "./model";
import { ProductSheet } from "./product-sheet";

let counter = 0;
const newKey = () => `n${Date.now().toString(36).slice(-6)}${(counter++).toString(36)}`;

function LineRow({ line, total, onQuantity, onRemove }: { line: FormLine; total: number; onQuantity: (quantity: number) => void; onRemove: () => void }) {
  const { t, locale } = useI18n();
  const name = line.kind === "free" ? line.name : localized(line.name, locale);
  const details = line.kind === "free" ? [] : line.details;
  return (
    <li className="grid gap-2 rounded-card border border-border bg-card p-2 min-[20rem]:p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 font-semibold wrap-anywhere">{name}</span>
        <span className="whitespace-nowrap tabular-nums">{formatRupees(total)}</span>
      </div>
      {details.length > 0 && <p className="text-sm wrap-anywhere">{details.join(", ")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("admin.orderForm.quantityOf", { name })} className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="outline" size="icon" onClick={() => onQuantity(line.quantity - 1)} disabled={line.quantity <= 1} aria-label={t("admin.orderForm.decrease", { name })}>
            <Minus aria-hidden="true" />
          </Button>
          <span className="min-w-8 text-center font-semibold tabular-nums" aria-live="polite">
            {line.quantity}
          </span>
          <Button type="button" variant="outline" size="icon" onClick={() => onQuantity(line.quantity + 1)} disabled={line.quantity >= QUANTITY_MAX} aria-label={t("admin.orderForm.increase", { name })}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={t("admin.orderForm.remove", { name })}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/**
 * The order's items (S-122 AC1, AC5, AC11; manual orders FR-055): kept items, products from the
 * menu and free-text items, each with a labelled quantity stepper ("Increase quantity of …") and
 * Remove; the line totals come from the same pricing as the server.
 */
export function LinesEditor({ lines, totals, menu, error, onChange }: { lines: FormLine[]; totals: number[]; menu: Menu; error?: string; onChange: (lines: FormLine[]) => void }) {
  const { t } = useI18n();
  const [sheet, setSheet] = useState<"product" | "free" | null>(null);
  const update = (index: number, next: FormLine | null) => onChange(next ? lines.map((line, i) => (i === index ? next : line)) : lines.filter((_, i) => i !== index));
  return (
    <FormSection id="lines-heading" title={t("admin.orderForm.itemsTitle")}>
      <ul id="lines" tabIndex={-1} className="mt-3 grid gap-2" aria-labelledby="lines-heading">
        {lines.map((line, index) => (
          <LineRow key={line.key} line={line} total={totals[index] ?? 0} onQuantity={(quantity) => update(index, { ...line, quantity })} onRemove={() => update(index, null)} />
        ))}
      </ul>
      {error && <p className="mt-2 font-semibold text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full shrink whitespace-normal" onClick={() => setSheet("product")} aria-haspopup="dialog">
          <Plus aria-hidden="true" />
          {t("admin.orderForm.addProduct")}
        </Button>
        <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full shrink whitespace-normal" onClick={() => setSheet("free")} aria-haspopup="dialog">
          <Plus aria-hidden="true" />
          {t("admin.orderForm.addFreeText")}
        </Button>
      </div>
      <ProductSheet
        open={sheet === "product"}
        onClose={() => setSheet(null)}
        menu={menu}
        onAdd={(picked) => onChange([...lines, { key: newKey(), kind: "catalogue", productId: picked.product.id, name: picked.product.name, options: picked.options, cakeMessage: picked.cakeMessage, quantity: picked.quantity, details: picked.details }])}
      />
      <FreeTextSheet open={sheet === "free"} onClose={() => setSheet(null)} onAdd={(free) => (onChange([...lines, { key: newKey(), kind: "free", ...free }]), setSheet(null))} />
    </FormSection>
  );
}
