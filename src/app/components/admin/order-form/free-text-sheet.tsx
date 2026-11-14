import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { useI18n } from "~/i18n/react";
import { Field, inputClass, invalidProps } from "./fields";
import { QUANTITY_MAX } from "./model";

const PRICE_MAX = 1_000_000;

type Problem = "name" | "price" | "quantity";

function problems(name: string, price: string, quantity: string): Problem[] {
  const found: Problem[] = [];
  if (name.trim() === "" || name.trim().length > 120) found.push("name");
  if (!/^\d+$/.test(price.trim()) || Number(price) > PRICE_MAX) found.push("price");
  if (!/^\d+$/.test(quantity.trim()) || Number(quantity) < 1 || Number(quantity) > QUANTITY_MAX) found.push("quantity");
  return found;
}

/** A free-text item (S-122 AC5; manual orders FR-055): name, price each (Rs 0 allowed, a gift), quantity. */
export function FreeTextSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (line: { name: string; priceRs: number; quantity: number }) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [shown, setShown] = useState<Problem[]>([]);
  const error = (problem: Problem, key: string) => (shown.includes(problem) ? t(key) : undefined);
  return (
    <Modal open={open} onClose={onClose} title={t("admin.orderForm.freeTitle")} closeLabel={t("admin.states.close")}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const found = problems(name, price, quantity);
          setShown(found);
          if (found.length > 0) return;
          onAdd({ name: name.trim(), priceRs: Number(price), quantity: Number(quantity) });
          setName("");
          setPrice("");
          setQuantity("1");
        }}
      >
        <Field id="free-name" label={t("admin.orderForm.freeName")} error={error("name", "admin.orderForm.freeNameProblem")}>
          <input id="free-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={inputClass} {...invalidProps("free-name", error("name", "x"))} />
        </Field>
        <Field id="free-price" label={t("admin.orderForm.freePrice")} error={error("price", "admin.orderForm.freePriceProblem")}>
          <input id="free-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" className={inputClass} {...invalidProps("free-price", error("price", "x"))} />
        </Field>
        <Field id="free-quantity" label={t("admin.orderForm.quantity")} error={error("quantity", "admin.orderForm.freeQuantityProblem")}>
          <input id="free-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoComplete="off" className={inputClass} {...invalidProps("free-quantity", error("quantity", "x"))} />
        </Field>
        <Button type="submit" size="lg" className="mt-6 h-auto min-h-12 w-full whitespace-normal">
          {t("admin.orderForm.add")}
        </Button>
      </form>
    </Modal>
  );
}
