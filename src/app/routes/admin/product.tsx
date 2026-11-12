import { Check, ChevronLeft } from "lucide-react";
import { type FocusEvent, type FormEvent, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Link, data, useBlocker, useFetcher, useNavigate } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { OptionGroupsEditor, optionAnchor } from "~/components/admin/option-groups-editor";
import { PhotoManager } from "~/components/admin/photo-manager";
import { usePhotoUploads } from "~/components/admin/use-photo-uploads";
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
import { publicConfigContext } from "~/server/public-config.server";
import { findAdminProduct, getProductDefaults, listCategories } from "~/server/repos/admin-menu.server";
import { saveProduct } from "~/server/services/save-product.server";
import { storageContext, uploadContext } from "~/server/storage.server";
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
    id ? findAdminProduct(db, id, args.context.get(publicConfigContext).supabaseUrl) : Promise.resolve(null),
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

/** English names of the posted groups, so an option problem can say which group ("Size: …"). */
function postedGroupNames(form: FormData): string[] {
  try {
    const groups = JSON.parse(String(form.get("optionGroups") ?? "[]")) as { name?: { en?: unknown } }[];
    return Array.isArray(groups) ? groups.map((g) => (typeof g?.name?.en === "string" ? g.name.en.trim().slice(0, 60) : "")) : [];
  } catch {
    return [];
  }
}

/** `optionGroups.2.choices.0.name.en` + `missing` -> "Size, choice 1: enter the choice name in English." */
function optionMessage(field: string, problem: ProductProblem, locale: Locale, names: string[]): string | null {
  const match = /^optionGroups\.(\d+)(?:\.choices\.(\d+))?(?:\.(.+))?$/.exec(field);
  if (!match) return null;
  const [, g, c, rest] = match;
  const group = names[Number(g)] || translate("admin.product.options.groupN", locale, { n: Number(g) + 1 });
  const part = c !== undefined ? `choice_${(rest ?? "").replace(".", "_")}` : (rest ?? "group").replace(".", "_");
  return translate(`admin.product.errors.option.${part}_${problem}`, locale, { group, n: Number(c ?? 0) + 1 });
}

function localizedProblems(problems: Partial<Record<string, ProductProblem>>, locale: Locale, groupNames: string[] = []): Record<string, string> {
  return Object.fromEntries(
    Object.entries(problems).map(([field, problem]) => [field, optionMessage(field, problem!, locale, groupNames) ?? translate(problemKey(field, problem!), locale)]),
  );
}

/** `admin/product` save → `{ ok, id, slug }`; VALIDATION_FAILED / SLUG_TAKEN / UPLOAD_REJECTED with `fields`; NOT_FOUND. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const routeId = productId(args.params);
  const form = await args.request.formData();
  if (form.get("intent") !== "save") return actionError("VALIDATION_FAILED", me.locale);
  const parsed = parseProductForm(form);
  if (!parsed.ok) return actionError("VALIDATION_FAILED", me.locale, { fields: localizedProblems(parsed.problems, me.locale, postedGroupNames(form)) });
  const input = { ...parsed.input, ...(routeId ? { id: routeId } : {}) };
  const result = await saveProduct(args.context.get(requestDbContext).db, input, {
    adminId: me.id,
    now: args.context.get(clockContext).now(),
    uploads: args.context.get(uploadContext),
    storage: args.context.get(storageContext),
  });
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
  photos: "photos",
  minQuantity: "min-quantity",
  optionGroups: "options",
  seasonal: "season-starts",
  id: "name-en",
};

/** The summary's links: fixed fields plus each option group path (AC4: links to that group). */
function anchorsFor(fields: Record<string, string> | undefined): Record<string, string> {
  const extra = Object.keys(fields ?? {}).flatMap((field) => {
    const id = optionAnchor(field);
    return id ? [[field, id] as const] : [];
  });
  return { ...ANCHORS, ...Object.fromEntries(extra) };
}

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

function NamesSection({ product, errors, onFrenchName, onEnglishName }: { product: LoaderData["product"]; errors: Fields; onFrenchName: (v: string) => void; onEnglishName: (v: string) => void }) {
  const { t } = useI18n();
  const [frenchName, setFrenchName] = useState(product?.name.fr ?? "");
  const optional = t("admin.product.optional");
  return (
    <fieldset className="grid gap-4 md:grid-cols-2">
      <legend className="mb-2 text-xl font-semibold">{t("admin.product.namesSection")}</legend>
      <TextField id="name-en" name="name.en" label={t("admin.product.nameEn")} defaultValue={product?.name.en} maxLength={PRODUCT_NAME_MAX} error={errors["name.en"]} autoComplete="off" onInput={(event) => onEnglishName(event.currentTarget.value)} />
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

function PriceField({ defaultValue, error, onPrice }: { defaultValue?: number; error?: string; onPrice: (value: number | null) => void }) {
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
          onInput={(event) => {
            const value = event.currentTarget.value.trim();
            onPrice(/^\d+$/.test(value) ? Number(value) : null);
          }}
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

/** Seasonal dates (S-049): optional, both or neither, both days included. */
function SeasonFields({ window, error }: { window: { startsOn: string; endsOn: string } | null; error?: string }) {
  const { t } = useI18n();
  const describedBy = (id: string) => [`${id}-hint`, "season-hint", error ? "season-error" : ""].filter(Boolean).join(" ");
  const field = (id: string, name: string, label: string, value: string | undefined) => (
    <div className="min-w-0">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t("admin.product.season.format")}
      </p>
      <input
        id={id}
        name={name}
        type="date"
        defaultValue={value ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id)}
        className="mt-2 block min-h-12 w-full max-w-60 min-w-0 rounded-md border-2 border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
      />
    </div>
  );
  return (
    <fieldset>
      <legend className="font-semibold">
        {t("admin.product.season.legend")} <span className="font-normal">{t("admin.product.optional")}</span>
      </legend>
      <p id="season-hint" className="text-sm text-muted-foreground">
        {t("admin.product.season.hint")}
      </p>
      <div className="mt-2 grid gap-4 min-[30rem]:grid-cols-2 md:max-w-xl">
        {field("season-starts", "seasonal.startsOn", t("admin.product.season.starts"), window?.startsOn)}
        {field("season-ends", "seasonal.endsOn", t("admin.product.season.ends"), window?.endsOn)}
      </div>
      {error && (
        <p id="season-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function OtherFields({ loaderData, errors, onPrice, children }: { loaderData: LoaderData; errors: Fields; onPrice: (value: number | null) => void; children?: ReactNode }) {
  const { t } = useI18n();
  const { product, settingsDefaults, categories } = loaderData;
  const optional = t("admin.product.optional");
  return (
    <>
      <PriceField defaultValue={product?.basePriceRs} error={errors.basePriceRs} onPrice={onPrice} />
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
      <TextField
        id="min-quantity"
        name="minQuantity"
        label={t("admin.product.minQuantity")}
        optionalLabel={optional}
        hint={t("admin.product.minQuantityHint")}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        defaultValue={product?.minQuantity ?? ""}
        error={errors.minQuantity}
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
      {children}
      <SeasonFields window={product?.seasonal ?? null} error={errors.seasonal} />
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

/** Polite live region for list changes (photos moved, removed, uploaded). */
function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => {
    // Cleared first so the same sentence twice is announced twice.
    setMessage("");
    requestAnimationFrame(() => setMessage(text));
  }, []);
  const region = (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
  return { announce, region };
}

/**
 * Save while photos are still uploading waits for them, then sends (the button says so);
 * a photo that failed blocks the save with a message until it is retried or removed.
 */
function useSaveWithPhotos(fetcher: ReturnType<typeof useFetcher<ActionData>>, form: RefObject<HTMLFormElement | null>, photos: ReturnType<typeof usePhotoUploads>) {
  const [pendingSave, setPendingSave] = useState(false);
  const [blockedPress, setBlockedPress] = useState(false);
  const submitted = useRef(false);
  const { busy, failed } = photos.summary;
  // Save pressed during uploads: sent once they are all done (none failed).
  useEffect(() => {
    if (!pendingSave || busy || failed > 0 || submitted.current || !form.current) return;
    submitted.current = true;
    void fetcher.submit(form.current);
  }, [pendingSave, busy, failed, fetcher, form]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    setBlockedPress(failed > 0);
    if (failed > 0) {
      event.preventDefault();
      setPendingSave(false);
      document.getElementById("photos")?.focus();
    } else if (busy) {
      event.preventDefault();
      submitted.current = false;
      setPendingSave(true);
    } else setPendingSave(false);
  };
  return {
    waiting: pendingSave && busy,
    blocked: failed > 0 && (blockedPress || (pendingSave && !busy)),
    onSubmit,
    /** Any change to the photo list cancels a save that was waiting for uploads. */
    cancel: () => setPendingSave(false),
  };
}

/**
 * A focused control never stays under the sticky Save bar (WCAG 2.4.11). Browsers do not
 * scroll a control that is already partly visible, so `scroll-padding` alone leaves a tall
 * field's lower edge under the bar; this scrolls by the overlap.
 */
function keepAboveSaveBar(event: FocusEvent<HTMLFormElement>) {
  const bar = event.currentTarget.querySelector<HTMLElement>("[data-editor-bar]");
  if (!bar || getComputedStyle(bar).position !== "sticky") return;
  const target = event.target as HTMLElement;
  // Fields only, typed into: a button is pressed where it is (scrolling would move it from under the finger).
  if (!target.matches("input:not([type=checkbox], [type=radio], [type=file]), textarea, select") || bar.contains(target)) return;
  const box = (target.closest("label") ?? target).getBoundingClientRect();
  const overlap = box.bottom - bar.getBoundingClientRect().top;
  if (overlap > 0 && box.top - overlap - 16 >= 0) window.scrollBy({ top: overlap + 16, behavior: "instant" });
}

export default function AdminProduct({ loaderData }: Route.ComponentProps) {
  // Keyed by product: a newly created product's page starts from what the server saved.
  return <ProductEditor key={loaderData.product?.id ?? "new"} loaderData={loaderData} />;
}

function ProductEditor({ loaderData }: { loaderData: LoaderData }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const [dirty, setDirty] = useState(false);
  const { blocker, dirtyRef } = useUnsavedGuard(dirty);
  const { product } = loaderData;
  const { announce, region } = useAnnouncer();
  const [englishName, setEnglishName] = useState(product?.name.en ?? "");
  const [basePrice, setBasePrice] = useState<number | null>(product?.basePriceRs ?? null);
  const photos = usePhotoUploads(product?.photos ?? [], ({ key, values }) => announce(t(key, values)));
  const formRef = useRef<HTMLFormElement>(null);
  const save = useSaveWithPhotos(fetcher, formRef, photos);
  const { summary, refusal } = useSaveFeedback(fetcher, (id) => {
    dirtyRef.current = false;
    setDirty(false);
    if (!product) void navigate(`/admin/menu/${id}`, { replace: true });
  });
  const errors = refusal?.fields ?? {};
  const saving = fetcher.state !== "idle" || save.waiting;
  const markDirty = (_event?: FormEvent) => setDirty(true);
  return (
    <>
      <Link to="/admin/menu" className="inline-flex min-h-11 items-center gap-1 font-semibold link">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("admin.product.back")}
      </Link>
      <h1 className="mt-2">{loaderData.title}</h1>
      {product?.updated && <p className="mt-2 text-sm">{t("admin.product.updatedBy", { name: product.updated.name, time: formatClockTime(new Date(product.updated.at)) })}</p>}
      {refusal && <ErrorSummary ref={summary} message={refusal.message} fields={refusal.fields} anchors={anchorsFor(refusal.fields)} title={t("admin.product.errorSummaryTitle")} />}
      {region}
      <fetcher.Form ref={formRef} method="post" onChange={markDirty} onInput={markDirty} onSubmit={save.onSubmit} onFocus={keepAboveSaveBar} className="mt-6 grid gap-8" noValidate>
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="photos" value={JSON.stringify(photos.summary.posted)} />
        <input type="hidden" name="uploadSessionId" value={photos.sessionId() ?? ""} />
        <PhotoManager
          photos={photos}
          productName={englishName}
          error={errors.photos ?? (save.blocked ? t("admin.product.photos.blockedSave") : undefined)}
          onChange={() => {
            setDirty(true);
            save.cancel();
          }}
          announce={announce}
        />
        <NamesSection product={product} errors={errors} onFrenchName={() => setDirty(true)} onEnglishName={setEnglishName} />
        <OtherFields loaderData={loaderData} errors={errors} onPrice={setBasePrice}>
          <OptionGroupsEditor
            initial={product?.optionGroups ?? []}
            basePrice={basePrice}
            cakeMessageMax={loaderData.settingsDefaults.cakeMessageMax}
            errors={errors}
            onChange={() => setDirty(true)}
            announce={announce}
          />
        </OtherFields>
        {/* Sticky above the bottom bar; static while typing on a phone (keyboard up) and at 200% zoom. */}
        <div data-editor-bar="" className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card px-4 py-3 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
          <SubmitButton
            pending={saving}
            pendingText={save.waiting ? t("admin.product.photos.waitingSave") : t("admin.product.saving")}
            pendingLabel={save.waiting ? t("admin.product.photos.waitingSaveLabel") : t("admin.product.savingLabel")}
            className="w-full md:w-auto"
          >
            {t("admin.product.save")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      <LeaveDialog blocker={blocker} />
    </>
  );
}
