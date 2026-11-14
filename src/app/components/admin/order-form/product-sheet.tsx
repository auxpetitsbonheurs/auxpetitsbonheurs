import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import type { OptionPick } from "~/domain/basket";
import type { Menu, MenuOptionGroup, MenuProduct } from "~/domain/menu";
import { menuLimits } from "~/domain/menu";
import { productPricing } from "~/domain/menu-pricing";
import { validateSelection } from "~/domain/pricing";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { Field, inputClass } from "./fields";
import { QUANTITY_MAX } from "./model";

export interface PickedProduct {
  product: MenuProduct;
  options: OptionPick[];
  cakeMessage?: string;
  quantity: number;
  details: string[];
}

type Picks = Record<string, { choiceIds: string[]; text: string; quantity: string }>;

const empty = { choiceIds: [] as string[], text: "", quantity: "" };

function picksToOptions(groups: MenuOptionGroup[], picks: Picks): OptionPick[] {
  return groups.flatMap((group) => {
    const pick = picks[group.id] ?? empty;
    if (group.kind === "text") return pick.text.trim() ? [{ groupId: group.id, choiceIds: [], text: pick.text.trim() }] : [];
    if (group.kind === "quantity") {
      const qty = Number(pick.quantity);
      return pick.quantity && group.choices[0] ? [{ groupId: group.id, choiceIds: [group.choices[0].id], quantity: qty }] : [];
    }
    return pick.choiceIds.length > 0 ? [{ groupId: group.id, choiceIds: pick.choiceIds }] : [];
  });
}

function GroupInput({ group, pick, onChange }: { group: MenuOptionGroup; pick: Picks[string]; onChange: (next: Picks[string]) => void }) {
  const { locale } = useI18n();
  const label = localized(group.name, locale);
  if (group.kind === "text" || group.kind === "quantity") {
    const id = `opt-${group.id}`;
    return (
      <Field id={id} label={label}>
        <input id={id} inputMode={group.kind === "quantity" ? "numeric" : "text"} value={group.kind === "text" ? pick.text : pick.quantity} onChange={(e) => onChange(group.kind === "text" ? { ...pick, text: e.target.value } : { ...pick, quantity: e.target.value })} className={inputClass} />
      </Field>
    );
  }
  const multiple = group.kind === "multiple";
  const toggle = (id: string) => onChange({ ...pick, choiceIds: multiple ? (pick.choiceIds.includes(id) ? pick.choiceIds.filter((c) => c !== id) : [...pick.choiceIds, id]) : [id] });
  return (
    <fieldset className="mt-4">
      <legend className="font-semibold">{label}</legend>
      <div className="mt-2 grid gap-2">
        {group.choices.map((choice) => (
          <label key={choice.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-2 border-input bg-card px-3 has-checked:border-primary">
            <input type={multiple ? "checkbox" : "radio"} name={`opt-${group.id}`} checked={pick.choiceIds.includes(choice.id)} onChange={() => toggle(choice.id)} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 wrap-anywhere">{localized(choice.name, locale)}</span>
            {choice.priceDeltaRs !== 0 && <span className="whitespace-nowrap tabular-nums">+{formatRupees(choice.priceDeltaRs)}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProductOptions({ product, menu, onAdd, onBack }: { product: MenuProduct; menu: Menu; onAdd: (picked: PickedProduct) => void; onBack: () => void }) {
  const { t, locale } = useI18n();
  const [picks, setPicks] = useState<Picks>({});
  const [quantity, setQuantity] = useState(String(product.minQuantity ?? 1));
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const name = localized(product.name, locale);
  const add = () => {
    const options = picksToOptions(product.optionGroups, picks);
    const qty = Number(quantity);
    const issues = Number.isInteger(qty) && qty >= 1 && qty <= QUANTITY_MAX ? validateSelection(productPricing(product), { productId: product.id, options, quantity: qty, ...(message.trim() ? { cakeMessage: message.trim() } : {}) }, menuLimits(menu)) : [{ code: "quantity" }];
    if (issues.length > 0) return setProblem(t("admin.orderForm.optionInvalid", { name }));
    const details = options.flatMap((option) => product.optionGroups.find((g) => g.id === option.groupId)?.choices.filter((c) => option.choiceIds.includes(c.id)).map((c) => localized(c.name, locale)) ?? []);
    onAdd({ product, options, cakeMessage: message.trim() || undefined, quantity: qty, details: option(details, message) });
  };
  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={onBack}>
        {t("admin.orderForm.back")}
      </Button>
      <p className="mt-3 text-lg font-semibold wrap-anywhere">{name}</p>
      {product.optionGroups.map((group) => (
        <GroupInput key={group.id} group={group} pick={picks[group.id] ?? empty} onChange={(next) => setPicks({ ...picks, [group.id]: next })} />
      ))}
      <Field id="product-quantity" label={t("admin.orderForm.quantity")}>
        <input id="product-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
      </Field>
      <Field id="product-message" label={t("admin.orderForm.cakeMessage")}>
        <input id="product-message" value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass} />
      </Field>
      {problem && (
        <p role="alert" className="mt-3 font-semibold text-destructive">
          {problem}
        </p>
      )}
      <Button type="button" size="lg" onClick={add} className="mt-6 h-auto min-h-12 w-full whitespace-normal">
        {t("admin.orderForm.add")}
      </Button>
    </div>
  );
}

const option = (details: string[], message: string) => (message.trim() ? [...details, `“${message.trim()}”`] : details);

/**
 * Add a product (S-122; manual orders FR-055): the menu's products, searchable, sold-out ones
 * marked but allowed for admins; choosing one shows its options, checked with the same rules as
 * the server before it is added.
 */
export function ProductSheet({ open, onClose, menu, onAdd }: { open: boolean; onClose: () => void; menu: Menu; onAdd: (picked: PickedProduct) => void }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<MenuProduct | null>(null);
  const close = () => (setChosen(null), setQuery(""), onClose());
  const shown = menu.products.filter((p) => localized(p.name, locale).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Modal open={open} onClose={close} title={t("admin.orderForm.productTitle")} closeLabel={t("admin.states.close")}>
      {chosen ? (
        <ProductOptions product={chosen} menu={menu} onBack={() => setChosen(null)} onAdd={(picked) => (onAdd(picked), close())} />
      ) : (
        <>
          <label htmlFor="product-search" className="block font-semibold">
            {t("admin.orderForm.productSearch")}
          </label>
          <input id="product-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={inputClass} />
          <ul className="mt-3 grid gap-2">
            {shown.map((product) => (
              <li key={product.id}>
                <button type="button" onClick={() => setChosen(product)} aria-label={t("admin.orderForm.choose", { name: localized(product.name, locale) })} className="flex min-h-12 w-full items-center gap-3 rounded-md border-2 border-input bg-card px-3 text-start hover:bg-accent">
                  <span className="min-w-0 flex-1 font-semibold wrap-anywhere">{localized(product.name, locale)}</span>
                  {product.status === "sold_out" && <span className="text-sm">{t("admin.orderForm.soldOut")}</span>}
                  <span className="whitespace-nowrap tabular-nums">{formatRupees(product.basePriceRs)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
