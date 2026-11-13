// The product page ordering area (S-066, S-067): one picker per option group, the message on
// the cake, quantity, the live price and Add to basket. Prices come from domain/pricing run
// on the loader's product data; the server prices again at checkout (FR-011).
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import type { OptionPick } from "~/domain/basket";
import { DomainError } from "~/domain/errors";
import { type LineInput, type ProductPricing, type PricingGroup, canonicalLine, fromPriceRs, priceLine, validateSelection } from "~/domain/pricing";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { basketStore } from "~/lib/basket-store";
import { formatRupees, localePath } from "~/lib/locale";
import { readFormSelection } from "./form-selection";
import { PromoPrice } from "~/components/site/promo-price";
import { MessageField } from "./message-field";
import { CLEAR_OF_BAR, OptionPicker, Stepper } from "./option-picker";
import { issueFields } from "./selection-messages";

/** Taps closer together than this add once (a double tap is one add). */
const DOUBLE_TAP_MS = 800;
/** The live region speaks the price once the customer pauses (AC2: debounced). */
const ANNOUNCE_MS = 500;
/** Keeps "Rs" with its number when the price wraps on a narrow screen (design-system Price). */
const nbsp = (price: string) => price.replace(" ", "\u00a0");

export interface OrderFormProduct extends ProductPricing {
  optionGroups: PricingGroup[];
  minQuantity: number | null;
  /** The live offer the server applied (S-082): its sale base price and id; null or absent = none. */
  salePriceRs?: number | null;
  promotionId?: string | null;
}

/** The server's offer for the base price (display only; placeOrder prices again). */
const offerOf = (product: OrderFormProduct) =>
  product.promotionId && typeof product.salePriceRs === "number" ? { promotionId: product.promotionId, salePriceRs: product.salePriceRs } : null;

export interface OrderFormProps {
  product: OrderFormProduct;
  cakeMessageMax: number;
  /** Show the Message-on-cake field (cakes without their own text group). */
  takesMessage: boolean;
  /** A refusal of the no-JavaScript post (message and per-field messages). */
  refusal?: { message: string; fields?: Record<string, string>; selection?: Omit<LineInput, "productId"> };
}

type ServerAnswer = { ok: true; basketCount: number } | { ok: false; error: { message: string; fields?: Record<string, string> } };

/** The element to focus for a field with a problem (AC3: the first missing group). */
function fieldElement(field: string): HTMLElement | null {
  if (field.startsWith("options.")) {
    const id = field.slice("options.".length);
    const text = document.getElementById(`optionText.${id}`);
    return text ?? document.querySelector<HTMLElement>(`#group-${CSS.escape(id)} input`);
  }
  return document.getElementById(field === "quantity" ? "quantity" : "cakeMessage");
}

function usePriceAnnouncement(text: string) {
  const [announced, setAnnounced] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => setAnnounced(text), ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return announced;
}

/** Starts from the refused post's own choices when there is one (no-JavaScript path). */
function useSelection(product: OrderFormProduct, echoed?: Omit<LineInput, "productId">) {
  const [picks, setPicks] = useState<Record<string, OptionPick>>(() => Object.fromEntries((echoed?.options ?? []).map((p) => [p.groupId, { ...p, choiceIds: [...p.choiceIds] }])));
  const [quantity, setQuantity] = useState(echoed?.quantity ?? product.minQuantity ?? 1);
  const [message, setMessage] = useState(echoed?.cakeMessage ?? "");
  const input: LineInput = {
    productId: product.id,
    options: product.optionGroups.flatMap((g) => (picks[g.id] ? [picks[g.id]!] : [])),
    ...(message ? { cakeMessage: message } : {}),
    quantity,
  };
  // The page can hydrate seconds after it is shown (S-276 AC7): adopt what was picked or typed in
  // the plain form meanwhile, so the Add button and the price agree with what the customer sees.
  const groups = product.optionGroups;
  const adopt = useCallback(
    (form: HTMLFormElement) => {
      const read = readFormSelection(new FormData(form), groups);
      setPicks((current) => {
        const next = Object.fromEntries(read.options.map((p) => [p.groupId, p]));
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
      setQuantity(read.quantity);
      setMessage(read.cakeMessage);
    },
    [groups],
  );
  const pick = (next: OptionPick) => setPicks((current) => ({ ...current, [next.groupId]: next }));
  return { picks, pick, adopt, quantity, setQuantity, message, setMessage, input };
}

/**
 * The live price: exact once every required group is chosen, else "From Rs X"; with an offer
 * (S-082) also the original price (`was`), struck through. Options are never discounted.
 */
function useLivePrice(product: OrderFormProduct, input: LineInput, cakeMessageMax: number) {
  const { t } = useI18n();
  return useMemo(() => {
    const limits = { cakeMessageMax };
    const offer = offerOf(product);
    if (validateSelection(product, input, limits).length === 0) {
      const line = priceLine(product, input, offer, limits);
      const shown = (amount: number) => {
        const total = nbsp(formatRupees(amount));
        return input.quantity > 1 ? t("productOptions.totalFor", { price: total, count: input.quantity }) : total;
      };
      return { price: shown(line.lineTotalRs), was: offer ? shown(line.originalUnitPriceRs * input.quantity) : null, exact: true };
    }
    const from = (promo: typeof offer) => t("productOptions.fromPrice", { price: nbsp(formatRupees(fromPriceRs(product, promo))) });
    return { price: from(offer), was: offer ? from(null) : null, exact: false };
  }, [product, input, cakeMessageMax, t]);
}

export function ProductOrderForm({ product, cakeMessageMax, takesMessage, refusal }: OrderFormProps) {
  const { t, locale } = useI18n();
  const fetcher = useFetcher<ServerAnswer>();
  const inFlight = useRef(false);
  const lastTap = useRef(-Infinity);
  const selection = useSelection(product, refusal?.selection);
  const [errors, setErrors] = useState<Record<string, string>>(refusal?.fields ?? {});
  const [added, setAdded] = useState(0);
  const [inBasket, setInBasket] = useState(1);
  const [localError, setLocalError] = useState<string>();
  const form = useRef<HTMLFormElement>(null);
  const live = useLivePrice(product, selection.input, cakeMessageMax);
  const announced = usePriceAnnouncement(t("productOptions.priceAnnounce", { price: live.was ? t("promo.wasNow", { old: live.was, new: live.price }) : live.price }));
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const serverAdded = fetcher.state !== "submitting" && result?.ok === true;
  const serverFields = result && !result.ok ? result.error.fields : undefined;
  const shownErrors = { ...errors, ...serverFields };
  const formError = localError ?? (result && !result.ok && !serverFields ? result.error.message : refusal && !refusal.fields ? refusal.message : undefined);
  const name = localized(product.name, locale);

  const { adopt } = selection;
  useEffect(() => {
    if (form.current) adopt(form.current);
  }, [adopt]);

  useEffect(() => {
    if (serverAdded) basketStore.refresh();
  }, [serverAdded]);

  // This form is a lazy chunk: it can hydrate after the root's `data-hydrated` marker, and a tap
  // before that is a plain post to the basket. e2e specs wait for this marker before testing
  // the instant Add (it is set once the submit handler is attached).
  useEffect(() => {
    form.current?.setAttribute("data-enhanced", "");
  }, []);

  // A corrected field loses its message at once (calm validation).
  const clear = (field: string) => setErrors(({ [field]: _gone, ...rest }) => rest);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = performance.now();
    if (inFlight.current || busy || now - lastTap.current < DOUBLE_TAP_MS) return;
    const issues = validateSelection(product, selection.input, { cakeMessageMax });
    if (issues.length > 0) {
      // AC3: nothing is added, focus goes to the first problem with its message; the button stays enabled.
      setAdded(0);
      setErrors(issueFields(issues, product.optionGroups, t, locale));
      requestAnimationFrame(() => fieldElement(issues.find((i) => i.field.startsWith("options.") && i.code === "required")?.field ?? issues[0]!.field)?.focus());
      return;
    }
    lastTap.current = now;
    setErrors({});
    try {
      const lines = basketStore.add(canonicalLine(product, selection.input));
      setLocalError(undefined);
      // "(2 in basket)" so a deliberate second tap visibly counts (UX audit M6).
      setInBasket(lines.filter((l) => l.productId === product.id).reduce((sum, l) => sum + l.quantity, 0));
      setAdded((n) => n + 1);
    } catch (problem) {
      if (problem instanceof DomainError) {
        setAdded(0);
        setLocalError(t(`errors.codes.${problem.code}`));
        return;
      }
      // The cookie cannot be written from script: the server adds it (ADR-0004 fallback).
      const form = new FormData(event.currentTarget);
      form.set("respond", "inline");
      inFlight.current = true;
      void fetcher.submit(form, { method: "post" }).finally(() => {
        inFlight.current = false;
      });
    }
  };

  return (
    <>
      {formError && (
        <Alert tone="danger" role="alert" className="mt-6">
          <p>{formError}</p>
        </Alert>
      )}
      <form ref={form} method="post" onSubmit={submit} noValidate className="mt-2">
        <input type="hidden" name="intent" value="addToBasket" />
        <input type="hidden" name="productId" value={product.id} />
        {product.optionGroups.map((group) => (
          <OptionPicker
            key={group.id}
            group={group}
            pick={selection.picks[group.id]}
            onPick={(next) => {
              selection.pick(next);
              clear(`options.${group.id}`);
            }}
            error={shownErrors[`options.${group.id}`]}
            cakeMessageMax={cakeMessageMax}
          />
        ))}
        {takesMessage && (
          <MessageField
            id="cakeMessage"
            name="cakeMessage"
            label={t("productOptions.message")}
            hint={t("productOptions.messageHint", { max: cakeMessageMax })}
            max={cakeMessageMax}
            value={selection.message}
            onChange={(value) => {
              selection.setMessage(value);
              clear("cakeMessage");
            }}
            error={shownErrors.cakeMessage}
          />
        )}
        <div className="mt-6">
          <Stepper
            id="quantity"
            name="quantity"
            label={t("productOptions.quantity")}
            hint={product.minQuantity ? t("productOptions.minimumNote", { min: product.minQuantity }) : undefined}
            value={selection.quantity}
            min={product.minQuantity ?? 1}
            max={50}
            onChange={(value) => {
              selection.setQuantity(value);
              clear("quantity");
            }}
            decreaseLabel={t("productOptions.decrease", { name })}
            increaseLabel={t("productOptions.increase", { name })}
          />
          {shownErrors.quantity && <p className="mt-1 font-semibold text-destructive">{shownErrors.quantity}</p>}
        </div>
        {/* Sticky on phones so the price and Add stay in reach; focused controls scroll clear of it (CLEAR_OF_BAR). */}
        <div data-add-bar className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t-2 border-border bg-background py-3 md:static md:border-t-0 md:py-0">
          <p className="min-w-0">
            <span className="block text-sm text-muted-foreground">{t("productOptions.price")}</span>
            <span data-testid="live-price" className="text-2xl font-semibold text-primary-strong">
              <PromoPrice price={live.price} was={live.was} />
            </span>
          </p>
          <SubmitButton size="lg" className={`max-w-full ${CLEAR_OF_BAR}`} pending={fetcher.state === "submitting"} pendingText={t("product.adding")} pendingLabel={t("product.adding")}>
            {t("product.addToBasket")}
          </SubmitButton>
        </div>
        <p className="sr-only" aria-live="polite">
          {announced}
        </p>
      </form>
      <div role="status">
        {(added > 0 || serverAdded) && !formError && (
          <Alert key={added} tone="success" title={t("product.addedCount", { count: serverAdded ? 1 : inBasket })} className="mt-4">
            <Link to={localePath(locale, "/basket")} prefetch="render" className="mt-1 inline-flex min-h-11 items-center font-semibold link">
              {t("product.viewBasket")}
            </Link>
          </Alert>
        )}
      </div>
    </>
  );
}
