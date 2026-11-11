import { Check, ChevronLeft } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, data, useBlocker, useFetcher, useNavigate } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { showToast } from "~/components/ui/toaster";
import {
  ALLERGEN_TAGS,
  PRODUCT_CATEGORY_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  type ProductType,
} from "~/domain/product";
import { formatClockTime } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { type ProductField, type ProductProblem, parseProductForm } from "~/server/contracts/admin";
import { Uuid } from "~/server/contracts/shared";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { findAdminProduct, getProductDefaults, listCategories } from "~/server/repos/admin-menu.server";
import { saveProduct } from "~/server/services/save-product.server";
import type { Route } from "./+types/product";

/** `admin/product` (FR-062): `/admin/menu/new` and `/admin/menu/:id`. */
export const handle = { titleKey: "admin.nav.menu" };

const isProductType = (value: string | null): value is ProductType => (PRODUCT_TYPES as readonly string[]).includes(value ?? "");

/** The `:id` of an edit URL (404 when malformed); undefined on /admin/menu/new. */
function productId(params: { id?: string }): string | undefined {
  if (params.id === undefined) return undefined;
  const id = Uuid.safeParse(params.id);
  if (!id.success) throw data(null, { status: 404 });
  return id.data;
}

/** `admin/product` loader (contracts.md): the product (null when new), suggestions and Settings defaults. */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = productId(args.params);
  const db = args.context.get(requestDbContext).db;
  const [product, categories, settingsDefaults] = await Promise.all([
    id ? findAdminProduct(db, id) : Promise.resolve(null),
    listCategories(db),
    getProductDefaults(db),
  ]);
  if (product === undefined) throw data(null, { status: 404 });
  const type = args.url.searchParams.get("type");
  return {
    title: translate(product ? "admin.product.editTitle" : "admin.product.newTitle", me.locale),
    product,
    newType: isProductType(type) ? type : "cake",
    categories,
    allergenTags: [...ALLERGEN_TAGS],
    previewUrl: null,
    settingsDefaults,
  };
}

const problemKey = (field: string, problem: ProductProblem) => `admin.product.errors.${field.replace(".", "_")}_${problem}`;

function localizedProblems(problems: Partial<Record<string, ProductProblem>>, locale: Locale): Record<string, string> {
  return Object.fromEntries(Object.entries(problems).map(([field, problem]) => [field, translate(problemKey(field, problem!), locale)]));
}

/** `admin/product` save → `{ ok, id, slug }`; VALIDATION_FAILED / SLUG_TAKEN with `fields`; NOT_FOUND. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const routeId = productId(args.params);
  const form = await args.request.formData();
  if (form.get("intent") !== "save") return actionError("VALIDATION_FAILED", me.locale);
  const parsed = parseProductForm(form);
  if (!parsed.ok) return actionError("VALIDATION_FAILED", me.locale, { fields: localizedProblems(parsed.problems, me.locale) });
  const input = { ...parsed.input, ...(routeId ? { id: routeId } : {}) };
  const result = await saveProduct(args.context.get(requestDbContext).db, input, { adminId: me.id, now: args.context.get(clockContext).now() });
  if (!result.ok) {
    return actionError(result.code, me.locale, "fields" in result ? { fields: localizedProblems(result.fields, me.locale) } : {});
  }
  console.log(JSON.stringify({ level: "info", event: "product_saved", id: result.id, isNew: !input.id, actorRole: me.role }));
  return { ok: true as const, id: result.id, slug: result.slug };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type ActionData = Awaited<ReturnType<typeof action>>;
type Fields = Record<string, string>;

/** Field name -> element id, for the error summary's links. */
const ANCHORS: Record<ProductField | "id", string> = {
  "name.en": "name-en",
  "name.fr": "name-fr",
  "description.en": "description-en",
  "description.fr": "description-fr",
  basePriceRs: "price",
  noticeDays: "notice",
  type: "type",
  category: "category",
  status: "status",
  slug: "slug",
  allergens: "allergens",
  id: "name-en",
};

/** After a save: toast "Saved" (and `onSaved`), or focus on the error summary. */
function useSaveFeedback(fetcher: ReturnType<typeof useFetcher<ActionData>>, onSaved: (id: string) => void) {
  const { t } = useI18n();
  const summary = useRef<HTMLDivElement>(null);
  const handled = useRef<unknown>(null);
  const result = fetcher.data as { ok: true; id: string } | { ok: false; error: { message: string; fields?: Fields } } | undefined;
  useEffect(() => {
    if (fetcher.state !== "idle" || !result || handled.current === result) return;
    handled.current = result;
    if (result.ok) {
      showToast(t("admin.product.saved"));
      onSaved(result.id);
    } else summary.current?.focus();
  });
  return { summary, refusal: result && !result.ok ? result.error : undefined };
}

function NamesSection({ product, errors, onFrenchName }: { product: LoaderData["product"]; errors: Fields; onFrenchName: (v: string) => void }) {
  const { t } = useI18n();
  const [frenchName, setFrenchName] = useState(product?.name.fr ?? "");
  const optional = t("admin.product.optional");
  return (
    <fieldset className="grid gap-4 md:grid-cols-2">
      <legend className="mb-2 text-xl font-semibold">{t("admin.product.namesSection")}</legend>
      <TextField id="name-en" name="name.en" label={t("admin.product.nameEn")} defaultValue={product?.name.en} maxLength={PRODUCT_NAME_MAX} error={errors["name.en"]} autoComplete="off" />
      <TextField
        id="name-fr"
        name="name.fr"
        label={t("admin.product.nameFr")}
        optionalLabel={optional}
        defaultValue={product?.name.fr ?? ""}
        maxLength={PRODUCT_NAME_MAX}
        error={errors["name.fr"]}
        hint={frenchName.trim() === "" ? t("admin.product.frenchMissing") : undefined}
        onInput={(event) => {
          setFrenchName(event.currentTarget.value);
          onFrenchName(event.currentTarget.value);
        }}
        autoComplete="off"
      />
      <TextField id="description-en" name="description.en" label={t("admin.product.descriptionEn")} optionalLabel={optional} multiline rows={4} defaultValue={product?.description.en ?? ""} maxLength={PRODUCT_DESCRIPTION_MAX} error={errors["description.en"]} />
      <TextField id="description-fr" name="description.fr" label={t("admin.product.descriptionFr")} optionalLabel={optional} multiline rows={4} defaultValue={product?.description.fr ?? ""} maxLength={PRODUCT_DESCRIPTION_MAX} error={errors["description.fr"]} />
    </fieldset>
  );
}

function PriceField({ defaultValue, error }: { defaultValue?: number; error?: string }) {
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor="price" className="block font-semibold">
        {t("admin.product.price")}
      </label>
      <div className="mt-2 flex items-center gap-2">
        {/* Outside the value: the field holds whole rupees only (S-046 AC11). */}
        <span aria-hidden="true" className="font-semibold">
          Rs
        </span>
        <input
          id="price"
          name="basePriceRs"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "price-error" : undefined}
          className="block min-h-12 w-full max-w-48 rounded-md border-2 border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
        />
      </div>
      {error && (
        <p id="price-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceGroup({ id, legend, name, options, value, error, hint }: { id: string; legend: string; name: string; options: { value: string; label: string }[]; value: string; error?: string; hint?: string }) {
  return (
    <fieldset id={id} tabIndex={-1} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className="outline-none">
      <legend className="font-semibold">{legend}</legend>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          // The native radio covers the whole option (as RadioCard): one 44 px target with its own focus ring.
          <label key={option.value} className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-input bg-card px-3 py-2 has-checked:border-primary-strong has-checked:bg-accent">
            <input type="radio" name={name} value={option.value} defaultChecked={option.value === value} className="peer absolute -inset-0.5 cursor-pointer appearance-none rounded-md" />
            <span aria-hidden="true" className="size-5 shrink-0 rounded-full border-2 border-input bg-card peer-checked:border-[6px] peer-checked:border-primary" />
            <span className="font-semibold">{option.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function AllergenChips({ tags, selected, error }: { tags: string[]; selected: string[]; error?: string }) {
  const { t } = useI18n();
  return (
    <fieldset id="allergens" tabIndex={-1} className="outline-none" aria-describedby={error ? "allergens-error" : undefined}>
      <legend className="font-semibold">{t("admin.product.allergens")}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <label key={tag} className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-input bg-card px-4 py-2 has-checked:border-primary-strong has-checked:bg-accent">
            <input type="checkbox" name="allergens" value={tag} defaultChecked={selected.includes(tag)} className="peer absolute -inset-0.5 cursor-pointer appearance-none rounded-full" />
            {/* Selection shown by the check mark and the border, never colour alone. */}
            <Check aria-hidden="true" className="hidden size-4 peer-checked:block" />
            <span className="font-semibold">{t(`admin.product.allergen.${tag}`)}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id="allergens-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Asks before leaving with unsaved changes (S-046 AC6): in-app links and closing the tab. */
function useUnsavedGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return { blocker, dirtyRef };
}

function LeaveDialog({ blocker }: { blocker: ReturnType<typeof useBlocker> }) {
  const { t } = useI18n();
  const open = blocker.state === "blocked";
  return (
    <Modal open={open} onClose={() => blocker.reset?.()} title={t("admin.product.leaveTitle")} closeLabel={t("admin.states.close")} variant="dialog">
      <p>{t("admin.product.leaveBody")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => blocker.reset?.()} className="flex-1">
          {t("admin.product.stay")}
        </Button>
        <Button type="button" variant="outline" onClick={() => blocker.proceed?.()} className="flex-1 border-destructive">
          {t("admin.product.leave")}
        </Button>
      </div>
    </Modal>
  );
}

function OtherFields({ loaderData, errors }: { loaderData: LoaderData; errors: Fields }) {
  const { t } = useI18n();
  const { product, settingsDefaults, categories } = loaderData;
  const optional = t("admin.product.optional");
  return (
    <>
      <PriceField defaultValue={product?.basePriceRs} error={errors.basePriceRs} />
      <TextField
        id="notice"
        name="noticeDays"
        label={t("admin.product.notice")}
        optionalLabel={optional}
        hint={t("admin.product.noticeHint")}
        placeholder={t("admin.product.noticeDefault", { days: settingsDefaults.noticeDays })}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        defaultValue={product?.noticeDays ?? ""}
        error={errors.noticeDays}
        className="max-w-sm"
      />
      <AllergenChips tags={loaderData.allergenTags} selected={product?.allergens ?? []} error={errors.allergens} />
      <ChoiceGroup id="type" legend={t("admin.product.type")} name="type" value={product?.type ?? loaderData.newType} error={errors.type} options={PRODUCT_TYPES.map((value) => ({ value, label: t(`admin.menu.group.${value}`) }))} />
      <TextField id="category" name="category" label={t("admin.product.category")} optionalLabel={optional} hint={t("admin.product.categoryHint")} list="category-suggestions" defaultValue={product?.category ?? ""} maxLength={PRODUCT_CATEGORY_MAX} error={errors.category} autoComplete="off" />
      <datalist id="category-suggestions">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <ChoiceGroup
        id="status"
        legend={t("admin.product.status")}
        name="status"
        value={product?.status ?? "hidden"}
        error={errors.status}
        hint={t("admin.product.statusHint")}
        options={PRODUCT_STATUSES.map((value) => ({ value, label: t(`admin.product.statusName.${value}`) }))}
      />
      <TextField id="slug" name="slug" label={t("admin.product.slug")} optionalLabel={optional} hint={t("admin.product.slugHint")} defaultValue={product?.slug ?? ""} error={errors.slug} autoComplete="off" autoCapitalize="none" spellCheck={false} />
    </>
  );
}

export default function AdminProduct({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const [dirty, setDirty] = useState(false);
  const { blocker, dirtyRef } = useUnsavedGuard(dirty);
  const { product } = loaderData;
  const { summary, refusal } = useSaveFeedback(fetcher, (id) => {
    dirtyRef.current = false;
    setDirty(false);
    if (!product) void navigate(`/admin/menu/${id}`, { replace: true });
  });
  const errors = refusal?.fields ?? {};
  const saving = fetcher.state !== "idle";
  const markDirty = (_event?: FormEvent) => setDirty(true);
  return (
    <>
      <Link to="/admin/menu" className="inline-flex min-h-11 items-center gap-1 font-semibold link">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("admin.product.back")}
      </Link>
      <h1 className="mt-2">{loaderData.title}</h1>
      {product?.updated && <p className="mt-2 text-sm">{t("admin.product.updatedBy", { name: product.updated.name, time: formatClockTime(new Date(product.updated.at)) })}</p>}
      {refusal && <ErrorSummary ref={summary} message={refusal.message} fields={refusal.fields} anchors={ANCHORS} title={t("admin.product.errorSummaryTitle")} />}
      <fetcher.Form method="post" key={product?.id ?? "new"} onChange={markDirty} onInput={markDirty} className="mt-6 grid gap-8" noValidate>
        <input type="hidden" name="intent" value="save" />
        <NamesSection product={product} errors={errors} onFrenchName={() => setDirty(true)} />
        <OtherFields loaderData={loaderData} errors={errors} />
        {/* Sticky above the bottom bar; static while typing on a phone (keyboard up) and at 200% zoom. */}
        <div data-editor-bar="" className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card px-4 py-3 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
          <SubmitButton pending={saving} pendingText={t("admin.product.saving")} pendingLabel={t("admin.product.savingLabel")} className="w-full md:w-auto">
            {t("admin.product.save")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      <LeaveDialog blocker={blocker} />
    </>
  );
}
