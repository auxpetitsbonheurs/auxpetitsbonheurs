import { ChevronLeft } from "lucide-react";
import { type ChangeEvent, Suspense, lazy, useEffect, useRef, useState } from "react";
import type { ImageState } from "~/components/admin/site-image-field";
import { Link, data, useFetcher, useNavigate } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { LeaveDialog, keepAboveSaveBar, useUnsavedGuard } from "~/components/admin/unsaved-guard";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { RadioCard } from "~/components/ui/radio-card";
import { SubmitButton } from "~/components/ui/submit-button";
import { SwitchField } from "~/components/ui/switch-field";
import { TextField } from "~/components/ui/text-field";
import { showToast } from "~/components/ui/toaster";
import { PRODUCT_TYPES } from "~/domain/product";
import { salePriceRs } from "~/domain/promotions";
import { addDays, instantToMuDateTime, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { formatRupees, type Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { DISCOUNT_CHOICES, PROMO_LINK_KINDS, PROMO_PLACEMENTS, PROMO_TEXT_MAX, PROMO_TITLE_MAX, type PromotionProblem, parsePromotionForm } from "~/server/contracts/promotions";
import { Uuid } from "~/server/contracts/shared";
import { requestDbContext } from "~/server/db.server";
import { afterResponseContext } from "~/server/after-response.server";
import { publicImageUrl } from "~/lib/images";
import { publicConfigContext } from "~/server/public-config.server";
import { storageContext, uploadContext } from "~/server/storage.server";
import { type EditablePromotion, type PromotionProductChoice, findPromotion, listPromotionProducts, savePromotion } from "~/server/services/save-promotion.server";
import type { Route } from "./+types/promotion";

/** `admin/promotion` (S-053, FR-063): create or edit one promotion and its offer prices. */
export const handle = { titleKey: "admin.nav.promotions" };

/** The form's starting values: the saved promotion, or a new one from today 00:00 for a week. */
function editorValues(found: EditablePromotion | undefined, now: Date, supabaseUrl: string) {
  const today = todayMU(now);
  return {
    id: found?.id ?? null,
    title: found?.title ?? { en: "", fr: null },
    text: found?.text ?? { en: null, fr: null },
    startsAt: found ? instantToMuDateTime(found.startsAt) : `${today}T00:00`,
    endsAt: found ? instantToMuDateTime(found.endsAt) : `${addDays(today, 7)}T00:00`,
    active: found?.active ?? true,
    placement: found?.placement ?? "both",
    link: found?.link ?? { kind: "none" as const, productId: null, category: null },
    discounts: found?.discounts ?? [],
    imagePath: found?.imagePath ?? null,
    imageUrl: found?.imagePath ? publicImageUrl(found.imagePath, supabaseUrl) : null,
  };
}

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const db = args.context.get(requestDbContext).db;
  const now = args.context.get(clockContext).now();
  const id = args.params.id;
  if (id !== undefined && !Uuid.safeParse(id).success) throw data(null, { status: 404 });
  const found = id ? await findPromotion(db, id) : undefined;
  if (id && !found) throw data(null, { status: 404 });
  return {
    title: translate(found ? "admin.promotions.editTitle" : "admin.promotions.newTitle", me.locale),
    promotion: editorValues(found, now, args.context.get(publicConfigContext).supabaseUrl),
    products: await listPromotionProducts(db, now, found?.id ?? null),
  };
}

/** A parser problem as a sentence naming its field ("Ends: the end must be after the start."). */
function problemMessages(problems: Record<string, PromotionProblem>, products: PromotionProductChoice[], locale: Locale): Record<string, string> {
  const names = new Map(products.map((p) => [p.id, p.name]));
  return Object.fromEntries(
    Object.entries(problems).map(([field, problem]) => {
      const discount = /^discounts\.(.+)$/.exec(field);
      const label = discount ? translate("admin.promotions.field.discount", locale, { name: names.get(discount[1]!) ?? "" }) : translate(`admin.promotions.field.${field.replace(/\.(en|fr)$/, (_m, l: string) => (l === "en" ? "En" : "Fr"))}`, locale);
      return [field, translate(`admin.promotions.errors.${problem}`, locale, { field: label })];
    }),
  );
}

/** `save`: the whole promotion with its offer prices; every field problem at once. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const db = args.context.get(requestDbContext).db;
  const now = args.context.get(clockContext).now();
  const form = await args.request.formData();
  if (form.get("intent") !== "save") return actionError("VALIDATION_FAILED", me.locale);
  const products = await listPromotionProducts(db, now, null);
  const parsed = parsePromotionForm(form, new Set(products.map((p) => p.id)));
  if (!parsed.ok) return actionError("VALIDATION_FAILED", me.locale, { fields: problemMessages(parsed.problems, products, me.locale) });
  // An edit saves to the promotion in the URL only, never to an id posted from another page.
  if ((args.params.id ?? null) !== parsed.input.id) return actionError("VALIDATION_FAILED", me.locale);
  const session = Uuid.safeParse(form.get("uploadSessionId"));
  const result = await savePromotion(db, parsed.input, {
    adminId: me.id,
    now,
    uploadSessionId: session.success ? session.data.toLowerCase() : undefined,
    uploads: args.context.get(uploadContext),
    storage: args.context.get(storageContext),
    after: args.context.get(afterResponseContext),
  });
  if (!result.ok && result.code === "UPLOAD_REJECTED") return actionError(result.code, me.locale, { fields: { imagePath: translate("admin.promotions.imageRejected", me.locale) } });
  if (!result.ok) return actionError("NOT_FOUND", me.locale);
  console.log(JSON.stringify({ level: "info", event: "promotion_saved", id: result.id, isNew: !parsed.input.id, actorRole: me.role }));
  return { ok: true as const, id: result.id };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type Values = LoaderData["promotion"];
type Fields = Record<string, string>;
type Answer = { ok: true; id: string } | { ok: false; error: { message: string; fields?: Fields } };
type DiscountState = { kind: (typeof DISCOUNT_CHOICES)[number]; amount: string };

const ANCHORS: Record<string, string> = {
  "title.en": "title-en",
  "title.fr": "title-fr",
  "text.en": "text-en",
  "text.fr": "text-fr",
  startsAt: "starts-at",
  endsAt: "ends-at",
  placement: "placement-banner",
  linkProductId: "link-product",
  linkCategory: "link-category",
  imagePath: "promotion-image",
};
const anchorsFor = (fields: Fields | undefined) => ({ ...ANCHORS, ...Object.fromEntries(Object.keys(fields ?? {}).flatMap((f) => (f.startsWith("discounts.") ? [[f, `discount-${f.slice(10)}`]] : []))) });

const selectClass = "mt-2 block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 text-base aria-invalid:border-destructive";

function TextsSection({ values, errors }: { values: Values; errors: Fields }) {
  const { t } = useI18n();
  const optional = t("admin.promotions.optional");
  return (
    <fieldset className="grid min-w-0 gap-4 md:grid-cols-2">
      <legend className="mb-2 text-xl font-semibold">{t("admin.promotions.textSection")}</legend>
      <TextField id="title-en" name="title.en" label={t("admin.promotions.titleEn")} hint={t("admin.promotions.titleHint")} defaultValue={values.title.en} maxLength={PROMO_TITLE_MAX} error={errors["title.en"]} autoComplete="off" />
      <TextField id="title-fr" name="title.fr" label={t("admin.promotions.titleFr")} optionalLabel={optional} defaultValue={values.title.fr ?? ""} maxLength={PROMO_TITLE_MAX} error={errors["title.fr"]} autoComplete="off" />
      <TextField id="text-en" name="text.en" label={t("admin.promotions.textEn")} optionalLabel={optional} defaultValue={values.text.en ?? ""} maxLength={PROMO_TEXT_MAX} error={errors["text.en"]} multiline rows={2} />
      <TextField id="text-fr" name="text.fr" label={t("admin.promotions.textFr")} optionalLabel={optional} defaultValue={values.text.fr ?? ""} maxLength={PROMO_TEXT_MAX} error={errors["text.fr"]} multiline rows={2} />
    </fieldset>
  );
}

function WhenSection({ values, errors }: { values: Values; errors: Fields }) {
  const { t } = useI18n();
  return (
    <fieldset className="grid min-w-0 gap-4 md:grid-cols-2">
      <legend className="mb-2 text-xl font-semibold">{t("admin.promotions.whenSection")}</legend>
      <TextField id="starts-at" name="startsAt" type="datetime-local" label={t("admin.promotions.startsAt")} hint={t("admin.promotions.timeHint")} defaultValue={values.startsAt} error={errors.startsAt} />
      <TextField id="ends-at" name="endsAt" type="datetime-local" label={t("admin.promotions.endsAt")} hint={t("admin.promotions.timeHint")} defaultValue={values.endsAt} error={errors.endsAt} />
      <div className="md:col-span-2">
        <SwitchField id="active" name="active" label={t("admin.promotions.active")} hint={t("admin.promotions.activeHint")} defaultChecked={values.active} />
      </div>
    </fieldset>
  );
}

function LinkFields({ values, products, errors }: { values: Values; products: PromotionProductChoice[]; errors: Fields }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<string>(values.link.kind);
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <div>
        <label htmlFor="link-kind" className="block font-semibold">
          {t("admin.promotions.linkLegend")}
        </label>
        <select id="link-kind" name="linkKind" defaultValue={values.link.kind} onChange={(e) => setKind(e.currentTarget.value)} className={selectClass}>
          {PROMO_LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`admin.promotions.link.${k}`)}
            </option>
          ))}
        </select>
      </div>
      {kind === "product" && (
        <div>
          <label htmlFor="link-product" className="block font-semibold">
            {t("admin.promotions.linkProduct")}
          </label>
          <select id="link-product" name="linkProductId" defaultValue={values.link.productId ?? ""} aria-invalid={errors.linkProductId ? true : undefined} aria-describedby={errors.linkProductId ? "link-product-error" : undefined} className={selectClass}>
            <option value="">{t("admin.promotions.choose")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.linkProductId && <p id="link-product-error" className="mt-1 font-semibold text-destructive">{errors.linkProductId}</p>}
        </div>
      )}
      {kind === "category" && (
        <div>
          <label htmlFor="link-category" className="block font-semibold">
            {t("admin.promotions.linkCategory")}
          </label>
          <select id="link-category" name="linkCategory" defaultValue={values.link.category ?? ""} aria-invalid={errors.linkCategory ? true : undefined} aria-describedby={errors.linkCategory ? "link-category-error" : undefined} className={selectClass}>
            <option value="">{t("admin.promotions.choose")}</option>
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`collection.types.${type}`)}
              </option>
            ))}
          </select>
          {errors.linkCategory && <p id="link-category-error" className="mt-1 font-semibold text-destructive">{errors.linkCategory}</p>}
        </div>
      )}
    </div>
  );
}

function WhereSection({ values, products, errors }: { values: Values; products: PromotionProductChoice[]; errors: Fields }) {
  const { t } = useI18n();
  return (
    <fieldset className="grid min-w-0 gap-4">
      <legend className="mb-2 text-xl font-semibold">{t("admin.promotions.whereSection")}</legend>
      <div role="radiogroup" aria-labelledby="placement-label" className="grid gap-2 md:grid-cols-3">
        <p id="placement-label" className="font-semibold md:col-span-3">
          {t("admin.promotions.placementLegend")}
        </p>
        {PROMO_PLACEMENTS.map((p) => (
          <RadioCard key={p} id={`placement-${p}`} name="placement" value={p} title={t(`admin.promotions.placement.${p}`)} defaultChecked={values.placement === p} />
        ))}
      </div>
      <LinkFields values={values} products={products} errors={errors} />
    </fieldset>
  );
}

/** "Customers pay Rs 850 instead of Rs 1,000", or why no offer will show. */
function resultLine(product: PromotionProductChoice, state: DiscountState, t: ReturnType<typeof useI18n>["t"], locale: Locale): string | null {
  if (state.kind === "none" || !/^\d{1,7}$/.test(state.amount)) return null;
  const amount = Number(state.amount);
  const was = formatRupees(product.basePriceRs, locale);
  const sale = salePriceRs(product.basePriceRs, state.kind === "percent" ? { kind: "percent", percentOff: amount } : { kind: "sale_price", salePriceRs: amount });
  return sale === null ? t("admin.promotions.notLower", { was }) : t("admin.promotions.result", { price: formatRupees(sale, locale), was });
}

function DiscountRow({ product, initial, error }: { product: PromotionProductChoice; initial: DiscountState; error?: string }) {
  const { t, locale } = useI18n();
  const [state, setState] = useState(initial);
  const id = `discount-${product.id}`;
  const result = resultLine(product, state, t, locale);
  const describedBy = [`${id}-note`, error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <li className="grid gap-2 border-b border-border py-3 md:grid-cols-[minmax(0,1fr)_14rem_9rem] md:items-start md:gap-4">
      <div className="min-w-0">
        <p className="font-semibold wrap-anywhere">{product.name}</p>
        <p className="text-sm text-muted-foreground">
          {t("admin.promotions.basePrice", { price: formatRupees(product.basePriceRs, locale) })}
          {product.hidden && ` · ${t("admin.promotions.hidden")}`}
        </p>
      </div>
      <select
        id={id}
        name={`discount.${product.id}`}
        aria-label={t("admin.promotions.discountFor", { name: product.name })}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        defaultValue={initial.kind}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          const kind = e.currentTarget.value as DiscountState["kind"];
          setState((s) => ({ ...s, kind }));
        }}
        className={selectClass.replace("mt-2 ", "")}
      >
        {DISCOUNT_CHOICES.map((k) => (
          <option key={k} value={k}>
            {t(`admin.promotions.discount.${k}`)}
          </option>
        ))}
      </select>
      {state.kind !== "none" && (
        <input
          name={`amount.${product.id}`}
          aria-label={t("admin.promotions.amountFor", { name: product.name })}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          inputMode="numeric"
          pattern="[0-9]*"
          defaultValue={initial.amount}
          onInput={(e) => {
            const amount = e.currentTarget.value.trim();
            setState((s) => ({ ...s, amount }));
          }}
          className="block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 text-base aria-invalid:border-destructive"
        />
      )}
      <div id={`${id}-note`} className="text-sm md:col-span-3" aria-live="polite">
        {result && <p>{result}</p>}
        {state.kind !== "none" && product.inOtherOffer && <p>{t("admin.promotions.inOther")}</p>}
      </div>
      {error && (
        <p id={`${id}-error`} className="font-semibold text-destructive md:col-span-3">
          {error}
        </p>
      )}
    </li>
  );
}

function DiscountsSection({ values, products, errors }: { values: Values; products: PromotionProductChoice[]; errors: Fields }) {
  const { t } = useI18n();
  const byProduct = new Map(values.discounts.map((d) => [d.productId, d]));
  const initial = (productId: string): DiscountState => {
    const d = byProduct.get(productId);
    if (!d) return { kind: "none", amount: "" };
    return { kind: d.kind, amount: String(d.kind === "percent" ? d.percentOff : d.salePriceRs) };
  };
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xl font-semibold">{t("admin.promotions.discountsSection")}</legend>
      <p className="text-sm text-muted-foreground">{t("admin.promotions.discountsHint")}</p>
      <ul className="mt-2">
        {products.map((p) => (
          <DiscountRow key={p.id} product={p} initial={initial(p.id)} error={errors[`discounts.${p.id}`]} />
        ))}
      </ul>
    </fieldset>
  );
}

// The photo field and its upload code are their own chunk (NFR-001: this route sits near its
// 170 kB budget). Server rendering includes it; on an in-app visit the fallback shows for the
// moment the chunk takes and still posts the stored image unchanged.
const PromotionImage = lazy(() => import("~/components/admin/promotion-image"));

function PhotoFallback({ values }: { values: Values }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <p className="font-semibold">{t("admin.promotions.imageLabel")}</p>
      <p className="text-sm text-muted-foreground">{t("admin.promotions.imageHint")}</p>
      <input type="hidden" name="imagePath" value={values.imagePath ?? ""} />
      <span aria-hidden="true" className="mt-2 block size-24 rounded-md border border-border bg-decorative" />
    </div>
  );
}

function PhotoSection({ values, error, onState }: { values: Values; error?: string; onState: (state: ImageState) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xl font-semibold">{t("admin.promotions.imageSection")}</legend>
      <Suspense fallback={<PhotoFallback values={values} />}>
        <PromotionImage path={values.imagePath} url={values.imageUrl} error={error} onState={onState} />
      </Suspense>
    </fieldset>
  );
}

/** After a save: toast and back to the list, or focus on the error summary. */
function useSaveFeedback(fetcher: { state: string; data?: unknown }, onSaved: () => void) {
  const { t } = useI18n();
  const summary = useRef<HTMLDivElement>(null);
  const handled = useRef<unknown>(null);
  const result = fetcher.state === "idle" ? (fetcher.data as Answer | undefined) : undefined;
  useEffect(() => {
    if (!result || handled.current === result) return;
    handled.current = result;
    if (result.ok) {
      showToast(t("admin.promotions.saved"));
      onSaved();
    } else summary.current?.focus();
  });
  return { summary, refusal: result && !result.ok ? result.error : undefined };
}

export default function AdminPromotion({ loaderData }: Route.ComponentProps) {
  return <PromotionEditor key={loaderData.promotion.id ?? "new"} loaderData={loaderData} />;
}

function PromotionEditor({ loaderData }: { loaderData: LoaderData }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [dirty, setDirty] = useState(false);
  const { blocker, dirtyRef } = useUnsavedGuard(dirty);
  const values = loaderData.promotion;
  const { summary, refusal } = useSaveFeedback(fetcher, () => {
    dirtyRef.current = false;
    setDirty(false);
    void navigate("/admin/promotions");
  });
  const errors = refusal?.fields ?? {};
  const markDirty = () => setDirty(true);
  // Save waits for a photo still uploading (the posted path must be the finished upload).
  const [image, setImage] = useState<ImageState>("idle");
  return (
    <>
      <Link to="/admin/promotions" className="inline-flex min-h-11 items-center gap-1 font-semibold link">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("admin.promotions.back")}
      </Link>
      <h1 className="mt-2">{loaderData.title}</h1>
      {refusal && <ErrorSummary ref={summary} message={refusal.message} fields={refusal.fields} anchors={anchorsFor(refusal.fields)} title={t("admin.promotions.errorSummaryTitle")} />}
      <fetcher.Form method="post" onChange={markDirty} onInput={markDirty} onFocus={keepAboveSaveBar} className="mt-6 grid gap-8" noValidate>
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="id" value={values.id ?? ""} />
        <TextsSection values={values} errors={errors} />
        <PhotoSection
          values={values}
          error={errors.imagePath}
          onState={(state) => {
            setImage(state);
            markDirty();
          }}
        />
        <WhenSection values={values} errors={errors} />
        <WhereSection values={values} products={loaderData.products} errors={errors} />
        <DiscountsSection values={values} products={loaderData.products} errors={errors} />
        <div data-editor-bar="" className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card px-4 py-3 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
          <SubmitButton
            pending={fetcher.state !== "idle" || image === "working"}
            pendingText={image === "working" ? t("admin.settings.image.working") : t("admin.product.savingLabel")}
            pendingLabel={image === "working" ? t("admin.settings.image.working") : t("admin.product.savingLabel")}
            className="w-full md:w-auto"
          >
            {t("admin.promotions.save")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      <LeaveDialog blocker={blocker} />
    </>
  );
}
