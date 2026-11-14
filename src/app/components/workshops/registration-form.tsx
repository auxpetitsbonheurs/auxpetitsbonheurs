// The workshop registration form (E-15 S-303). Server-rendered and usable without JavaScript
// (the number of cakes then shows the first cake choices it was rendered with; the allergies
// description shows by CSS when "Yes" is chosen). The allergies question is an explicit choice:
// None, or Yes with a description (Owner 2026-11-14), so it is never skipped by accident. A
// refusal keeps everything typed; the error summary lists the problems as links and takes focus.
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { PrivacyNoteLink } from "~/components/site/privacy-link";
import { Alert } from "~/components/ui/alert";
import { RadioCard } from "~/components/ui/radio-card";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { WORKSHOP_LIMITS } from "~/domain/workshop";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { isPendingIntent } from "~/lib/pending";
import { useTurnstile } from "~/lib/use-turnstile";

export interface RegistrationFormData {
  eventId: string;
  idempotencyKey: string;
  priceRs: number;
  /** The most cakes offered: the places left, at most 10. */
  maxCakes: number;
  placesLeft: number;
  options: { id: string; name: string }[];
  turnstileSiteKey: string | null;
  /** Name, phone and email of a signed-in customer (E-11). */
  prefill: Record<string, string> | null;
}

export interface RegistrationRefusal {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
  values?: Record<string, string>;
}

const ANCHORS: Record<string, string> = {
  "contact.name": "contact-name",
  "contact.phone": "contact-phone",
  "contact.email": "contact-email",
  cakes: "cakes",
  allergiesChoice: "allergies-none",
  allergies: "allergies",
  peopleNames: "people-names",
  message: "message",
};

const anchorFor = (field: string) => ANCHORS[field] ?? (field.startsWith("cake.") ? `cake-${field.slice(5)}` : field);

const selectClass = "mt-2 block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 text-base aria-invalid:border-destructive";

function Heading({ id, text }: { id: string; text: string }) {
  return (
    <h3 id={id} className="border-b border-border pb-2 text-xl">
      {text}
    </h3>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="mt-1 font-semibold text-destructive">
      {text}
    </p>
  ) : null;
}

function CakesSection({ data, values, errors }: { data: RegistrationFormData; values: Record<string, string>; errors: Record<string, string> }) {
  const { t } = useI18n();
  const initial = Math.min(Math.max(Number(values.cakes) || 1, 1), data.maxCakes);
  const [count, setCount] = useState(initial);
  return (
    <section aria-labelledby="cakes-heading" className="mt-8 grid gap-4">
      <Heading id="cakes-heading" text={t("workshopForm.sections.cakes")} />
      <div>
        <label htmlFor="cakes" className="block font-semibold">
          {t("workshopForm.cakes")}
        </label>
        <p id="cakes-hint" className="text-sm text-muted-foreground">
          {t("workshopForm.cakesHint", { count: data.placesLeft })}
        </p>
        <select id="cakes" name="cakes" defaultValue={String(initial)} onChange={(e) => setCount(Number(e.currentTarget.value))} aria-describedby={errors.cakes ? "cakes-hint cakes-error" : "cakes-hint"} aria-invalid={errors.cakes ? true : undefined} className={selectClass}>
          {Array.from({ length: data.maxCakes }, (_, i) => (
            <option key={i} value={i + 1}>
              {t("workshopForm.cakesOption", { count: i + 1 })}
            </option>
          ))}
        </select>
        <FieldError id="cakes-error" text={errors.cakes} />
      </div>
      {Array.from({ length: count }, (_, i) => {
        const error = errors[`cake.${i}`];
        return (
          <div key={i}>
            <label htmlFor={`cake-${i}`} className="block font-semibold">
              {t("workshopForm.cake", { n: i + 1 })}
            </label>
            <select id={`cake-${i}`} name={`cake.${i}`} defaultValue={values[`cake.${i}`] ?? (data.options.length === 1 ? data.options[0]!.id : "")} aria-invalid={error ? true : undefined} aria-describedby={error ? `cake-${i}-error` : undefined} className={selectClass}>
              {data.options.length > 1 && <option value="">{t("workshopForm.cakeChoose")}</option>}
              {data.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <FieldError id={`cake-${i}-error`} text={error} />
          </div>
        );
      })}
      <p aria-live="polite" className="font-semibold">
        {t("workshopForm.total", { amount: formatRupees(count * data.priceRs) })}
      </p>
    </section>
  );
}

/** None / Yes, please describe: a required choice; the description shows (by CSS) only with Yes. */
function AllergiesField({ values, errors }: { values: Record<string, string>; errors: Record<string, string> }) {
  const { t } = useI18n();
  const choice = values.allergiesChoice;
  const describedBy = ["allergies-hint", errors.allergiesChoice ? "allergies-choice-error" : ""].filter(Boolean).join(" ");
  return (
    <fieldset className="group/allergy grid min-w-0 gap-2" aria-describedby={describedBy} aria-invalid={errors.allergiesChoice ? true : undefined}>
      <legend className="font-semibold">{t("workshopForm.allergiesLegend")}</legend>
      <p id="allergies-hint" className="text-sm text-muted-foreground">
        {t("workshopForm.allergiesHint")}
      </p>
      <FieldError id="allergies-choice-error" text={errors.allergiesChoice} />
      {(["none", "yes"] as const).map((value) => (
        <RadioCard key={value} id={`allergies-${value}`} name="allergiesChoice" value={value} title={value === "none" ? t("workshopForm.allergiesNone") : t("workshopForm.allergiesYes")} defaultChecked={choice === value} />
      ))}
      <div className="hidden group-has-[#allergies-yes:checked]/allergy:block">
        <TextField id="allergies" name="allergies" multiline rows={3} maxLength={WORKSHOP_LIMITS.allergiesMax} label={t("workshopForm.allergiesDescribe")} hint={t("workshopForm.allergiesDescribeHint")} error={errors.allergies} defaultValue={values.allergies} />
      </div>
    </fieldset>
  );
}

function useFocusOnRefusal(refusal: RegistrationRefusal | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refusal) ref.current?.focus();
  }, [refusal]);
  return ref;
}

export function RegistrationForm({ data, refusal }: { data: RegistrationFormData; refusal: RegistrationRefusal | undefined }) {
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const values = refusal?.values ?? data.prefill ?? {};
  const errors = refusal?.error.fields ?? {};
  const summaryRef = useFocusOnRefusal(refusal);
  const { state: botState, token: botToken, containerRef: botContainer } = useTurnstile(data.turnstileSiteKey, locale);
  const [blocked, setBlocked] = useState<string | null>(null);
  const submitting = isPendingIntent(navigation, "register");
  const optional = t("workshopForm.optional");

  const guard = (event: FormEvent<HTMLFormElement>) => {
    const reason = botState === "failed" ? t("workshopForm.botFailed") : botState === "loading" || (botState === "ready" && !botToken) ? t("workshopForm.botLoading") : null;
    setBlocked(reason);
    if (reason) event.preventDefault();
  };

  const anchors = Object.fromEntries(Object.keys(errors).map((f) => [f, anchorFor(f)]));
  return (
    <Form method="post" noValidate className="checkout-form" onSubmit={guard} aria-labelledby="register-heading">
      {refusal && <ErrorSummary ref={summaryRef} message={refusal.error.message} fields={refusal.error.fields} anchors={anchors} />}
      <input type="hidden" name="intent" value="register" />
      <input type="hidden" name="eventId" value={data.eventId} />
      <input type="hidden" name="idempotencyKey" value={values.idempotencyKey ?? data.idempotencyKey} />
      <input type="hidden" name="turnstileToken" value={botToken} />
      <p className="mt-2">{t("workshopForm.intro")}</p>
      <CakesSection key={refusal ? JSON.stringify(values) : "fresh"} data={data} values={values} errors={errors} />
      <section aria-labelledby="people-heading" className="mt-10 grid gap-4">
        <Heading id="people-heading" text={t("workshopForm.sections.people")} />
        <TextField id="people-names" name="peopleNames" type="text" autoComplete="off" maxLength={WORKSHOP_LIMITS.peopleNamesMax} label={t("workshopForm.people")} optionalLabel={optional} hint={t("workshopForm.peopleHint")} error={errors.peopleNames} defaultValue={values.peopleNames} />
        <AllergiesField values={values} errors={errors} />
      </section>
      <section aria-labelledby="contact-heading" className="mt-10 grid gap-4">
        <Heading id="contact-heading" text={t("workshopForm.sections.contact")} />
        <TextField id="contact-name" name="contact.name" type="text" autoComplete="name" label={t("checkout.name")} error={errors["contact.name"]} defaultValue={values["contact.name"]} />
        <TextField id="contact-phone" name="contact.phone" type="tel" inputMode="tel" autoComplete="tel" label={t("checkout.phone")} hint={t("checkout.phoneHint")} error={errors["contact.phone"]} defaultValue={values["contact.phone"]} />
        <TextField id="contact-email" name="contact.email" type="email" inputMode="email" autoComplete="email" label={t("checkout.email")} hint={t("checkout.emailHint")} error={errors["contact.email"]} defaultValue={values["contact.email"]} />
        <TextField id="message" name="message" multiline rows={3} maxLength={WORKSHOP_LIMITS.messageMax} label={t("workshopForm.message")} optionalLabel={optional} error={errors.message} defaultValue={values.message} />
      </section>
      <section aria-labelledby="send-heading" className="mt-10">
        <Heading id="send-heading" text={t("workshopForm.sections.send")} />
        <Alert tone="info" title={t("workshopForm.notice")} className="mt-4" />
        <div ref={botContainer} className="mt-4 empty:hidden" />
        {botState === "failed" && <Alert tone="danger" role="alert" title={t("workshopForm.botFailed")} className="mt-4" />}
        {blocked && botState !== "failed" && (
          <p role="alert" className="mt-4 font-semibold">
            {blocked}
          </p>
        )}
        <PrivacyNoteLink className="mt-4" />
        <div className="mt-4">
          <SubmitButton pending={submitting} pendingText={t("workshopForm.sending")} pendingLabel={t("workshopForm.sending")} size="lg" className="w-full whitespace-normal sm:w-auto">
            {t("workshopForm.send")}
          </SubmitButton>
        </div>
      </section>
    </Form>
  );
}
