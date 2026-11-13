// The custom cake request form (E-08 S-151, S-152, S-153, S-154, S-162). Server-rendered and
// usable without JavaScript (photos then wait for it); the date, time, delivery and contact
// sections are the checkout's own, with the same availability rules and reasons (FR-014). A
// refusal keeps everything typed and the photo tiles, and the top Alert lists the problems as
// links and takes focus (AC4, AC10). Submit waits for photo uploads and the bot check.
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { DateSection, TimeSection } from "~/components/checkout/checkout-steps";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { FulfilmentSection } from "~/components/checkout/fulfilment-section";
import { PolicyAcceptance } from "~/components/checkout/summary-section";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { type AvailabilityRules, basketDates } from "~/domain/availability";
import { OCCASIONS, REQUEST_LIMITS } from "~/domain/custom-request";
import type { TimeWindow } from "~/db/tables/json-types";
import { useI18n } from "~/i18n/react";
import { isPendingIntent } from "~/lib/pending";
import { putFile, requestUploadUrl } from "~/lib/request-upload";
import { useTurnstile } from "~/lib/use-turnstile";
import { PhotoPicker } from "./photo-picker";
import { type GalleryAttachment, useRequestPhotos } from "./use-request-photos";

export interface RequestFormData {
  idempotencyKey: string;
  uploadSessionId: string;
  today: string;
  availability: AvailabilityRules;
  windows: { delivery: TimeWindow[]; pickup: TimeWindow[] };
  pickup: { address: string | null; mapUrl: string | null };
  policies: string;
  whatsapp: string | null;
  attachedGalleryPhoto: GalleryAttachment | null;
  turnstileSiteKey: string | null;
}

export interface RequestRefusal {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
  values?: Record<string, string>;
  availability?: AvailabilityRules;
  windows?: { delivery: TimeWindow[]; pickup: TimeWindow[] };
}

/** Field name -> element the error summary links to. */
const ANCHORS: Record<string, string> = {
  occasion: "occasion",
  servings: "servings",
  flavours: "flavours",
  theme: "theme",
  cakeText: "cakeText",
  budgetRs: "budgetRs",
  details: "details",
  photos: "photos",
  fulfilment: "fulfilment",
  address: "address",
  landmark: "landmark",
  date: "date",
  windowId: "windows",
  "contact.name": "contact-name",
  "contact.phone": "contact-phone",
  "contact.email": "contact-email",
  acceptPolicies: "acceptPolicies",
};

function Heading({ id, text }: { id: string; text: string }) {
  return (
    <h2 id={id} className="section-title-start text-h2">
      <span className="min-w-0 wrap-anywhere">{text}</span>
    </h2>
  );
}

function OccasionField({ initial, error }: { initial?: string; error?: string }) {
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor="occasion" className="block font-semibold">
        {t("customRequest.occasion")}
      </label>
      <select
        id="occasion"
        name="occasion"
        defaultValue={initial ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "occasion-error" : undefined}
        className="mt-2 block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive"
      >
        <option value="" disabled>
          {t("customRequest.occasionChoose")}
        </option>
        {OCCASIONS.map((o) => (
          <option key={o} value={o}>
            {t(`customRequest.occasions.${o}`)}
          </option>
        ))}
      </select>
      {error && (
        <p id="occasion-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function CakeSection({ values, errors }: { values: Record<string, string>; errors: Record<string, string> }) {
  const { t } = useI18n();
  const optional = `(${t("customRequest.optional")})`;
  return (
    <section aria-labelledby="cake-heading" className="mt-8">
      <Heading id="cake-heading" text={t("customRequest.sections.cake")} />
      <div className="mt-4 grid max-w-xl gap-4">
        <OccasionField initial={values.occasion} error={errors.occasion} />
        <TextField id="servings" name="servings" type="number" inputMode="numeric" min={REQUEST_LIMITS.servingsMin} max={REQUEST_LIMITS.servingsMax} label={t("customRequest.servings")} hint={t("customRequest.servingsHint")} error={errors.servings} defaultValue={values.servings} />
        <TextField id="flavours" name="flavours" type="text" autoComplete="off" maxLength={REQUEST_LIMITS.shortTextMax} label={t("customRequest.flavours")} hint={t("customRequest.flavoursHint")} error={errors.flavours} defaultValue={values.flavours} />
        <TextField id="theme" name="theme" type="text" autoComplete="off" maxLength={REQUEST_LIMITS.shortTextMax} label={t("customRequest.theme")} optionalLabel={optional} error={errors.theme} defaultValue={values.theme} />
        <TextField id="cakeText" name="cakeText" type="text" autoComplete="off" maxLength={REQUEST_LIMITS.cakeTextMax} label={t("customRequest.cakeText")} optionalLabel={optional} hint={t("customRequest.cakeTextHint")} error={errors.cakeText} defaultValue={values.cakeText} />
        <TextField id="budgetRs" name="budgetRs" type="number" inputMode="numeric" min={0} label={t("customRequest.budget")} optionalLabel={optional} hint={t("customRequest.budgetHint")} error={errors.budgetRs} defaultValue={values.budgetRs} />
        <TextField id="details" name="details" multiline rows={4} autoComplete="off" maxLength={REQUEST_LIMITS.detailsMax} label={t("customRequest.details")} optionalLabel={optional} hint={t("customRequest.detailsHint")} error={errors.details} defaultValue={values.details} />
      </div>
    </section>
  );
}

function ContactSection({ values, errors }: { values: Record<string, string>; errors: Record<string, string> }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="contact-heading" className="mt-10">
      <Heading id="contact-heading" text={t("customRequest.sections.contact")} />
      <div className="mt-4 grid max-w-xl gap-4">
        <TextField id="contact-name" name="contact.name" type="text" autoComplete="name" label={t("checkout.name")} error={errors["contact.name"]} defaultValue={values["contact.name"]} />
        <TextField id="contact-phone" name="contact.phone" type="tel" inputMode="tel" autoComplete="tel" label={t("checkout.phone")} hint={t("checkout.phoneHint")} error={errors["contact.phone"]} defaultValue={values["contact.phone"]} />
        <TextField id="contact-email" name="contact.email" type="email" inputMode="email" autoComplete="email" label={t("checkout.email")} hint={t("checkout.emailHint")} error={errors["contact.email"]} defaultValue={values["contact.email"]} />
      </div>
    </section>
  );
}

/** Focus the top Alert after a refused submit (AC10). */
function useFocusOnRefusal(refusal: RequestRefusal | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refusal) ref.current?.focus();
  }, [refusal]);
  return ref;
}

/** Uploads one shrunk photo: a signed URL (with a fresh bot-check token), then the PUT. */
function useUploader(sessionId: string, takeToken: () => Promise<string | undefined>) {
  return useMemo(
    () => async (blob: Blob, type: string, onProgress: (fraction: number) => void) => {
      const issued = await requestUploadUrl(sessionId, type, blob.size, await takeToken());
      await putFile(issued.signedUrl, blob, onProgress);
      return issued.path;
    },
    [sessionId, takeToken],
  );
}

export function RequestForm({ data, refusal }: { data: RequestFormData; refusal: RequestRefusal | undefined }) {
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const values = refusal?.values ?? {};
  const errors = refusal?.error.fields ?? {};
  const summaryRef = useFocusOnRefusal(refusal);
  const { state: botState, token: botToken, containerRef: botContainer, takeToken } = useTurnstile(data.turnstileSiteKey, locale);
  const upload = useUploader(data.uploadSessionId, takeToken);
  const photos = useRequestPhotos(data.attachedGalleryPhoto, upload);
  const [blocked, setBlocked] = useState<string | null>(null);
  const rules = refusal?.availability ?? data.availability;
  const dates = useMemo(() => basketDates<string>(data.today, rules, []), [data.today, rules]);
  const submitting = isPendingIntent(navigation, "submitCustomRequest");

  const guard = (event: FormEvent<HTMLFormElement>) => {
    const reason = photos.busy ? t("customRequest.photosBusy") : botState === "failed" ? t("customRequest.botFailed") : botState === "loading" || (botState === "ready" && !botToken) ? t("customRequest.botLoading") : null;
    setBlocked(reason);
    if (reason) event.preventDefault();
  };

  return (
    <Form method="post" noValidate className="checkout-form" onSubmit={guard} aria-labelledby="request-form-heading">
      {refusal && <ErrorSummary ref={summaryRef} message={refusal.error.message} fields={refusal.error.fields} anchors={ANCHORS} />}
      <input type="hidden" name="intent" value="submitCustomRequest" />
      <input type="hidden" name="idempotencyKey" value={values.idempotencyKey ?? data.idempotencyKey} />
      <input type="hidden" name="uploadSessionId" value={data.uploadSessionId} />
      <input type="hidden" name="turnstileToken" value={botToken} />
      <CakeSection values={values} errors={errors} />
      <section aria-labelledby="photos-heading" className="mt-10">
        <Heading id="photos-heading" text={t("customRequest.sections.photos")} />
        <PhotoPicker tiles={photos.tiles} status={photos.status} problems={photos.problems} full={photos.full} error={errors.photos} onAdd={(files) => void photos.add(files)} onRemove={photos.remove} onRetry={photos.retry} />
      </section>
      <FulfilmentSection title={t("customRequest.sections.fulfilment")} pickupAddress={data.pickup.address} pickupMapUrl={data.pickup.mapUrl} initial={values} errors={errors} />
      <DateSection title={t("customRequest.sections.date")} dates={dates} today={data.today} initial={values.date} error={errors.date} whatsapp={data.whatsapp} />
      <TimeSection title={t("customRequest.sections.time")} windows={refusal?.windows ?? data.windows} initial={values} error={errors.windowId} />
      <ContactSection values={values} errors={errors} />
      <section aria-labelledby="send-heading" className="mt-10">
        <Heading id="send-heading" text={t("customRequest.sections.send")} />
        <Alert tone="info" title={t("customRequest.notice")} className="mt-4" />
        <PolicyAcceptance policies={data.policies} error={errors.acceptPolicies} initial={values.acceptPolicies === "on"} />
        <div ref={botContainer} className="mt-4 empty:hidden" />
        {botState === "failed" && (
          <Alert tone="danger" role="alert" title={t("customRequest.botFailed")} className="mt-4" />
        )}
        {blocked && botState !== "failed" && (
          <p role="alert" className="mt-4 font-semibold">
            {blocked}
          </p>
        )}
        <div className="mt-6">
          <SubmitButton pending={submitting} pendingText={t("customRequest.sending")} pendingLabel={t("customRequest.sending")} size="lg" className="w-full whitespace-normal sm:w-auto">
            {t("customRequest.send")}
          </SubmitButton>
        </div>
      </section>
    </Form>
  );
}
