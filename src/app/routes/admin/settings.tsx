import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { BilingualField, SettingsSection } from "~/components/admin/settings-fields";
import { type ImageState, SiteImageField } from "~/components/admin/site-image-field";
import { LeaveDialog, keepAboveSaveBar, useUnsavedGuard } from "~/components/admin/unsaved-guard";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { CheckboxRow } from "~/components/ui/checkbox-row";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { showToast } from "~/components/ui/toaster";
import {
  CAKE_MESSAGE_MAX,
  CAKE_MESSAGE_MIN,
  CONTENT_TEXT_MAX,
  DELIVERY_FEE_MAX_RS,
  FEATURED_MAX,
  HERO_TAGLINE_MAX,
  JUICE_NUMBER_MAX,
  PICKUP_ADDRESS_MAX,
  QUOTE_VALIDITY_MAX,
  QUOTE_VALIDITY_MIN,
} from "~/domain/settings";
import { JUICE_NAME_MAX } from "~/domain/payment";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { publicImageUrl } from "~/lib/images";
import { actionError } from "~/server/action-result.server";
import { afterResponseContext } from "~/server/after-response.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { parseSettingsForm } from "~/server/contracts/settings";
import { fieldMessages } from "~/server/field-messages.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { listFeaturableProducts, readOwnerSettings } from "~/server/repos/owner-settings.server";
import { saveSettings } from "~/server/services/save-settings.server";
import { DAILY_LIMIT, sentToday } from "~/server/email/daily-cap";
import { storageContext, uploadContext } from "~/server/storage.server";
import type { Route } from "./+types/settings";

/** `admin/settings` (**owner**): business values (S-058) and site content (S-059), one versioned Save. */
export const handle = { titleKey: "admin.nav.settings" };

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args, { role: "owner" });
  const db = args.context.get(requestDbContext).db;
  const { supabaseUrl } = args.context.get(publicConfigContext);
  const [settings, products] = await Promise.all([readOwnerSettings(db), listFeaturableProducts(db)]);
  const url = (path: string | null) => (path ? publicImageUrl(path, supabaseUrl) : null);
  return {
    title: translate(handle.titleKey, me.locale),
    settings,
    imageUrls: { hero: url(settings.heroImagePath), about: url(settings.aboutImagePath) },
    products,
    resendUsage: { sentToday: await sentToday(db, args.context.get(clockContext).now()), dailyLimit: DAILY_LIMIT },
  };
}

/** `save` → `{ ok, intent, version, warnings }`; VALIDATION_FAILED / UPLOAD_REJECTED with `fields`; SETTINGS_CHANGED 409. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args, { role: "owner" });
  const form = await args.request.formData();
  if (form.get("intent") !== "save") return actionError("VALIDATION_FAILED", me.locale);
  const parsed = parseSettingsForm(form);
  if (!parsed.ok) return actionError("VALIDATION_FAILED", me.locale, { fields: fieldMessages(parsed.problems, me.locale) });
  const result = await saveSettings(args.context.get(requestDbContext).db, parsed.version, parsed.input, {
    adminId: me.id,
    now: args.context.get(clockContext).now(),
    uploadSessionId: parsed.uploadSessionId,
    uploads: args.context.get(uploadContext),
    storage: args.context.get(storageContext),
    after: args.context.get(afterResponseContext),
  });
  if (!result.ok) return actionError(result.code, me.locale, "fields" in result ? { fields: fieldMessages(result.fields, me.locale) } : {});
  return { ok: true as const, intent: "save" as const, version: result.version, warnings: result.warnings };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type Settings = LoaderData["settings"];
type Errors = Record<string, string | undefined>;
type SaveAnswer = { ok: true; version: number; warnings: { policies: boolean } } | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

/** Field name -> element id for the error summary's links. */
const ANCHORS: Record<string, string> = {
  deliveryFeeRs: "delivery-fee",
  pickupAddress: "pickup-address",
  pickupMapUrl: "pickup-map",
  contactPhone: "contact-phone",
  contactWhatsapp: "contact-whatsapp",
  contactEmail: "contact-email",
  instagramUrl: "instagram",
  juiceName: "juice-name",
  juiceNumber: "juice",
  paymentWhatsapp: "payment-whatsapp",
  quoteValidityDays: "quote-validity",
  cakeMessageMax: "cake-message-max",
  eveningReminderAt: "evening-reminder",
  orderNumberPrefix: "order-prefix",
  heroImagePath: "hero-image",
  aboutImagePath: "about-image",
  featuredProductIds: "featured",
  version: "settings-title",
  ...Object.fromEntries(
    [
      ["heroTagline", "hero-tagline"],
      ["about", "about"],
      ["faq", "faq"],
      ["policies", "policies"],
      ["privacyNote", "privacy"],
    ].flatMap(([name, id]) => [
      [`${name}.en`, `${id}-en`],
      [`${name}.fr`, `${id}-fr`],
    ]),
  ),
};

function BusinessSections({ settings, errors }: { settings: Settings; errors: Errors }) {
  const { t } = useI18n();
  const optional = t("admin.product.optional");
  return (
    <>
      <SettingsSection id="delivery" title={t("admin.settings.deliveryTitle")}>
        <TextField id="delivery-fee" name="deliveryFeeRs" label={t("admin.settings.deliveryFee")} hint={t("admin.settings.deliveryFeeHint", { max: DELIVERY_FEE_MAX_RS.toLocaleString("en") })} inputMode="numeric" pattern="[0-9]*" autoComplete="off" defaultValue={settings.deliveryFeeRs} error={errors.deliveryFeeRs} className="max-w-sm" />
        <TextField id="pickup-address" name="pickupAddress" label={t("admin.settings.pickupAddress")} optionalLabel={optional} hint={t("admin.settings.pickupAddressHint")} multiline rows={3} maxLength={PICKUP_ADDRESS_MAX} autoComplete="off" defaultValue={settings.pickupAddress ?? ""} error={errors.pickupAddress} />
        <TextField id="pickup-map" name="pickupMapUrl" type="url" inputMode="url" label={t("admin.settings.pickupMap")} optionalLabel={optional} hint={t("admin.settings.urlHint")} autoComplete="off" autoCapitalize="none" spellCheck={false} defaultValue={settings.pickupMapUrl ?? ""} error={errors.pickupMapUrl} />
      </SettingsSection>
      <SettingsSection id="contact" title={t("admin.settings.contactTitle")} intro={t("admin.settings.contactIntro")}>
        <TextField id="contact-phone" name="contactPhone" type="tel" inputMode="tel" label={t("admin.settings.contactPhone")} optionalLabel={optional} hint={t("admin.settings.phoneHint")} autoComplete="off" defaultValue={settings.contactPhone ?? ""} error={errors.contactPhone} className="max-w-sm" />
        <TextField id="contact-whatsapp" name="contactWhatsapp" type="tel" inputMode="tel" label={t("admin.settings.contactWhatsapp")} optionalLabel={optional} hint={t("admin.settings.phoneHint")} autoComplete="off" defaultValue={settings.contactWhatsapp ?? ""} error={errors.contactWhatsapp} className="max-w-sm" />
        <TextField id="contact-email" name="contactEmail" type="email" inputMode="email" label={t("admin.settings.contactEmail")} optionalLabel={optional} autoComplete="off" autoCapitalize="none" spellCheck={false} defaultValue={settings.contactEmail ?? ""} error={errors.contactEmail} />
        <TextField id="instagram" name="instagramUrl" type="url" inputMode="url" label={t("admin.settings.instagram")} optionalLabel={optional} hint={t("admin.settings.urlHint")} autoComplete="off" autoCapitalize="none" spellCheck={false} defaultValue={settings.instagramUrl ?? ""} error={errors.instagramUrl} />
      </SettingsSection>
      {/* Juice payment (S-277): shown only on an order's own pages, never on public ones. */}
      <SettingsSection id="payment" title={t("admin.settings.paymentTitle")} intro={t("admin.settings.paymentIntro")}>
        <TextField id="juice-name" name="juiceName" label={t("admin.settings.juiceName")} optionalLabel={optional} hint={t("admin.settings.juiceNameHint")} maxLength={JUICE_NAME_MAX} autoComplete="off" defaultValue={settings.juiceName ?? ""} error={errors.juiceName} />
        <TextField id="juice" name="juiceNumber" type="tel" inputMode="tel" label={t("admin.settings.juice")} optionalLabel={optional} hint={t("admin.settings.juiceHint")} maxLength={JUICE_NUMBER_MAX} autoComplete="off" defaultValue={settings.juiceNumber ?? ""} error={errors.juiceNumber} className="max-w-sm" />
        <TextField id="payment-whatsapp" name="paymentWhatsapp" type="tel" inputMode="tel" label={t("admin.settings.paymentWhatsapp")} optionalLabel={optional} hint={t("admin.settings.paymentWhatsappHint")} maxLength={20} autoComplete="off" defaultValue={settings.paymentWhatsapp ?? ""} error={errors.paymentWhatsapp} className="max-w-sm" />
      </SettingsSection>
      <SettingsSection id="orders" title={t("admin.settings.ordersTitle")}>
        <TextField id="quote-validity" name="quoteValidityDays" label={t("admin.settings.quoteValidity")} hint={t("admin.settings.rangeHint", { min: QUOTE_VALIDITY_MIN, max: QUOTE_VALIDITY_MAX })} inputMode="numeric" pattern="[0-9]*" autoComplete="off" defaultValue={settings.quoteValidityDays} error={errors.quoteValidityDays} className="max-w-sm" />
        <TextField id="cake-message-max" name="cakeMessageMax" label={t("admin.settings.cakeMessageMax")} hint={t("admin.settings.rangeHint", { min: CAKE_MESSAGE_MIN, max: CAKE_MESSAGE_MAX })} inputMode="numeric" pattern="[0-9]*" autoComplete="off" defaultValue={settings.cakeMessageMax} error={errors.cakeMessageMax} className="max-w-sm" />
        <TextField id="evening-reminder" name="eveningReminderAt" label={t("admin.settings.eveningReminder")} hint={t("admin.settings.timeHint")} inputMode="numeric" autoComplete="off" maxLength={5} defaultValue={settings.eveningReminderAt} error={errors.eveningReminderAt} className="max-w-sm" />
        <TextField id="order-prefix" name="orderNumberPrefix" label={t("admin.settings.orderPrefix")} hint={t("admin.settings.orderPrefixHint")} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} defaultValue={settings.orderNumberPrefix} error={errors.orderNumberPrefix} className="max-w-sm" />
      </SettingsSection>
    </>
  );
}

const STATUS_FLAG = { available: null, sold_out: "admin.settings.flagSoldOut", hidden: "admin.settings.flagHidden" } as const;

/** Up to six products for the homepage (S-059 AC5): hidden and sold out are flagged in words. */
function FeaturedPicker({ loaderData, error, onChange }: { loaderData: LoaderData; error?: string; onChange: () => void }) {
  const { t, locale } = useI18n();
  const [chosen, setChosen] = useState(() => new Set(loaderData.settings.featuredProductIds));
  const full = chosen.size >= FEATURED_MAX;
  const toggle = (id: string, on: boolean) => {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    onChange();
  };
  return (
    <fieldset id="featured" tabIndex={-1} className="min-w-0 outline-offset-2" aria-describedby={`featured-hint featured-count${error ? " featured-error" : ""}`}>
      <legend className="text-lg font-semibold">{t("admin.settings.featured")}</legend>
      <p id="featured-hint" className="max-w-measure text-sm text-muted-foreground">
        {t("admin.settings.featuredHint", { max: FEATURED_MAX })}
      </p>
      <p id="featured-count" role="status" className="mt-1 font-semibold">
        {full ? t("admin.settings.featuredFull", { max: FEATURED_MAX }) : t("admin.settings.featuredCount", { count: chosen.size, max: FEATURED_MAX })}
      </p>
      {error && (
        <p id="featured-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
      {loaderData.products.length === 0 ? (
        <p className="mt-2">{t("admin.settings.featuredNone")}</p>
      ) : (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {loaderData.products.map((product) => {
            const on = chosen.has(product.id);
            const flag = STATUS_FLAG[product.status];
            return (
              <li key={product.id} className="min-w-0">
                <CheckboxRow name="featuredProductIds" value={product.id} checked={on} disabled={!on && full} onChange={(event) => toggle(product.id, event.currentTarget.checked)}>
                  {localized(product.name, locale)}
                  {flag && <span className="ml-2 rounded-sm border border-input px-1.5 text-sm font-semibold">{t(flag)}</span>}
                </CheckboxRow>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

interface ContentProps {
  loaderData: LoaderData;
  errors: Errors;
  sessionId: () => string;
  onImage: (field: "hero" | "about", state: ImageState) => void;
  onChange: () => void;
}

function ContentSections({ loaderData, errors, sessionId, onImage, onChange }: ContentProps) {
  const { t } = useI18n();
  const { settings, imageUrls } = loaderData;
  const imageHint = t("admin.settings.image.hint");
  return (
    <>
      <SettingsSection id="homepage" title={t("admin.settings.homepageTitle")} intro={t("admin.settings.contentIntro")}>
        <BilingualField name="heroTagline" id="hero-tagline" label={t("admin.settings.heroTagline")} max={HERO_TAGLINE_MAX} value={settings.heroTagline} errors={errors} />
        <SiteImageField id="hero-image" name="heroImagePath" label={t("admin.settings.heroImage")} hint={imageHint} path={settings.heroImagePath} url={imageUrls.hero} error={errors.heroImagePath} sessionId={sessionId} onChange={(state) => onImage("hero", state)} />
        <FeaturedPicker loaderData={loaderData} error={errors.featuredProductIds} onChange={onChange} />
      </SettingsSection>
      <SettingsSection id="about-section" title={t("admin.settings.aboutTitle")}>
        <BilingualField name="about" id="about" label={t("admin.settings.about")} max={CONTENT_TEXT_MAX} value={settings.about} multiline errors={errors} />
        <SiteImageField id="about-image" name="aboutImagePath" label={t("admin.settings.aboutImage")} hint={imageHint} path={settings.aboutImagePath} url={imageUrls.about} error={errors.aboutImagePath} sessionId={sessionId} onChange={(state) => onImage("about", state)} />
      </SettingsSection>
      <SettingsSection id="texts" title={t("admin.settings.textsTitle")} intro={t("admin.settings.textsIntro")}>
        <BilingualField name="faq" id="faq" label={t("admin.settings.faq")} hint={t("admin.settings.faqHint")} max={CONTENT_TEXT_MAX} value={settings.faq} multiline errors={errors} />
        <BilingualField name="policies" id="policies" label={t("admin.settings.policies")} hint={t("admin.settings.policiesHint")} max={CONTENT_TEXT_MAX} value={settings.policies} multiline errors={errors} />
        <BilingualField name="privacyNote" id="privacy" label={t("admin.settings.privacy")} max={CONTENT_TEXT_MAX} value={settings.privacyNote} multiline errors={errors} />
      </SettingsSection>
      <SettingsSection id="email" title={t("admin.settings.emailTitle")}>
        <p>{loaderData.resendUsage ? t("admin.settings.emailUsage", loaderData.resendUsage) : t("admin.settings.emailUsageLater")}</p>
      </SettingsSection>
    </>
  );
}

/** After a save: toast "Saved" (announced) and the policies warning; or focus on the problem. */
function useSaveFeedback(fetcher: ReturnType<typeof useFetcher<SaveAnswer>>, onSaved: () => void) {
  const { t } = useI18n();
  const summary = useRef<HTMLDivElement>(null);
  const handled = useRef<unknown>(null);
  const answer = fetcher.data;
  useEffect(() => {
    if (fetcher.state !== "idle" || !answer || handled.current === answer) return;
    handled.current = answer;
    if (answer.ok) {
      showToast(t("admin.settings.saved"));
      onSaved();
    } else summary.current?.focus();
  });
  return { summary, answer: fetcher.state === "idle" ? answer : undefined };
}

function ChangedAlert({ message, onReload, alertRef }: { message: string; onReload: () => void; alertRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  return (
    <Alert ref={alertRef} tone="danger" role="alert" tabIndex={-1} title={message} className="mt-6 outline-offset-2">
      <p>{t("admin.settings.changedBody")}</p>
      {/* A full load: the form starts again from what is saved now (changes are not merged). */}
      <a href="/admin/settings" onClick={onReload} className="mt-2 inline-flex min-h-11 items-center font-semibold link">
        {t("admin.settings.reload")}
      </a>
    </Alert>
  );
}

export default function AdminSettings({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const fetcher = useFetcher<SaveAnswer>();
  const [dirty, setDirty] = useState(false);
  const { blocker, dirtyRef } = useUnsavedGuard(dirty);
  const [images, setImages] = useState({ hero: "idle" as ImageState, about: "idle" as ImageState });
  // One upload session per page view, made on the first photo (a random id on the server would not hydrate).
  const [session, setSession] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const sessionId = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current = crypto.randomUUID();
      setSession(sessionRef.current);
    }
    return sessionRef.current;
  }, []);
  const { summary, answer } = useSaveFeedback(fetcher, () => {
    dirtyRef.current = false;
    setDirty(false);
  });
  const refusal = answer && !answer.ok ? answer.error : undefined;
  const uploading = images.hero === "working" || images.about === "working";
  const markDirty = () => setDirty(true);
  const errors: Errors = refusal?.fields ?? {};
  return (
    <div className="mx-auto max-w-4xl">
      <h1 id="settings-title" tabIndex={-1}>
        {t("admin.settings.title")}
      </h1>
      <p className="mt-1 max-w-measure">{t("admin.settings.intro")}</p>
      {refusal?.code === "SETTINGS_CHANGED" ? (
        <ChangedAlert
          message={refusal.message}
          alertRef={summary}
          onReload={() => {
            dirtyRef.current = false;
          }}
        />
      ) : refusal ? (
        <ErrorSummary ref={summary} message={refusal.message} fields={refusal.fields} anchors={ANCHORS} title={t("admin.settings.errorSummaryTitle")} />
      ) : null}
      {answer?.ok && answer.warnings.policies && (
        <Alert tone="warning" role="status" title={t("admin.settings.policiesWarningTitle")} className="mt-6">
          <p>{t("admin.settings.policiesWarning")}</p>
        </Alert>
      )}
      <fetcher.Form method="post" noValidate onChange={markDirty} onInput={markDirty} onFocus={keepAboveSaveBar} className="mt-6 grid gap-6">
        <input type="hidden" name="intent" value="save" />
        {/* The version the page was loaded (or last saved) with: a stale one is refused (AC7). */}
        <input type="hidden" name="version" value={answer?.ok ? answer.version : loaderData.settings.version} />
        <input type="hidden" name="uploadSessionId" value={session ?? ""} />
        <BusinessSections settings={loaderData.settings} errors={errors} />
        <ContentSections
          loaderData={loaderData}
          errors={errors}
          sessionId={sessionId}
          onChange={markDirty}
          onImage={(field, state) => {
            setImages((current) => ({ ...current, [field]: state }));
            markDirty();
          }}
        />
        {/* One Save, sticky above the bottom bar; static while typing on a phone and at 200% zoom. */}
        <div data-editor-bar="" className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card px-4 py-3 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
          <SubmitButton pending={fetcher.state !== "idle" || uploading} pendingText={uploading ? t("admin.settings.waitingPhoto") : t("admin.settings.saving")} pendingLabel={uploading ? t("admin.settings.waitingPhoto") : t("admin.settings.saving")} className="h-auto min-h-11 w-full whitespace-normal md:w-auto">
            {t("admin.settings.save")}
          </SubmitButton>
        </div>
      </fetcher.Form>
      <LeaveDialog blocker={blocker} />
    </div>
  );
}
