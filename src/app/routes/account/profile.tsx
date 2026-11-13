// `account/profile` (`/account`, S-210; contracts.md): the signed-in customer's name, phone and
// email language; the email is shown read-only (it is the identity, AC4). Customer only: every
// read and write is the session's own row (AC6).
import { PrivacyNoteLink } from "~/components/site/privacy-link";
import { Form, redirect } from "react-router";
import { AccountFrame, LanguageField, RefusalAlert, isRefusal, usePosting } from "~/components/account/account-ui";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { localeCookie } from "~/lib/locale-detect";
import { actionError } from "~/server/action-result.server";
import { parseProfile } from "~/server/contracts/account";
import { pageLocale, requireCustomer } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { updateProfile } from "~/server/repos/customer-accounts.server";
import type { Route } from "./+types/profile";

export async function loader(args: Route.LoaderArgs) {
  const customer = await requireCustomer(args);
  return {
    title: translate("account.profile.title", pageLocale(args)),
    savedBeforeRedirect: args.url.searchParams.get("saved") === "1",
    profile: { name: customer.name, phone: customer.phone, email: customer.authEmail, locale: customer.locale },
  };
}

export async function action(args: Route.ActionArgs) {
  const customer = await requireCustomer(args);
  const locale = pageLocale(args);
  const form = Object.fromEntries(await args.request.formData());
  const values = { name: String(form.name ?? ""), phone: String(form.phone ?? ""), locale: String(form.locale ?? "") };
  const parsed = parseProfile(form);
  if (!parsed.ok) {
    const fields = Object.fromEntries(Object.entries(parsed.problems).map(([field, key]) => [field, translate(key as string, locale)]));
    return actionError("VALIDATION_FAILED", locale, { fields, extra: { values } });
  }
  try {
    await updateProfile(args.context.get(requestDbContext).db, customer.id, parsed.value);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "profile_save_failed", error: error instanceof Error ? error.name : "unknown" }));
    return actionError("INTERNAL", locale, { extra: { values } });
  }
  // A new language applies at once (AC2): the page moves to its twin and remembers the choice.
  if (parsed.value.locale !== locale) {
    throw redirect(`${localePath(parsed.value.locale, "/account")}?saved=1`, { headers: { "Set-Cookie": localeCookie(parsed.value.locale) } });
  }
  return { ok: true as const, savedAt: Date.now() };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

const ANCHORS = { name: "name", phone: "phone" };

export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const pending = usePosting();
  const refusal = isRefusal(actionData) ? actionData : undefined;
  const values = refusal?.values;
  const fields = refusal?.error.fields;
  const saved = (actionData !== undefined && !refusal) || (actionData === undefined && loaderData.savedBeforeRedirect);
  const { profile } = loaderData;
  return (
    <AccountFrame title={t("account.profile.title")}>
      <div className="rounded-card border border-border bg-card p-2 min-[20rem]:p-5 sm:p-6">
        <RefusalAlert refusal={refusal} anchors={ANCHORS} message={refusal?.error.code === "INTERNAL" ? t("account.profile.failed") : undefined} />
        <Form method="post" noValidate className="grid gap-5" key={JSON.stringify(profile)}>
          <TextField id="name" name="name" label={t("account.profile.name")} autoComplete="name" maxLength={80} defaultValue={values?.name ?? profile.name} error={fields?.name} />
          <TextField
            id="phone"
            name="phone"
            type="tel"
            label={t("account.profile.phone")}
            hint={t("account.profile.phoneHint")}
            autoComplete="tel"
            inputMode="tel"
            defaultValue={values?.phone ?? profile.phone}
            error={fields?.phone}
          />
          <div>
            <p className="font-semibold">{t("account.profile.email")}</p>
            <p className="mt-1 wrap-anywhere">{profile.email}</p>
            <p className="text-sm text-muted-foreground">{t("account.profile.emailNote")}</p>
          </div>
          <LanguageField defaultValue={values?.locale || profile.locale} label={t("account.profile.language")} />
          <p className="text-sm text-muted-foreground">{t("account.profile.pastOrdersNote")}</p>
          <PrivacyNoteLink />
          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton pending={pending} pendingText={t("account.profile.saving")} size="lg" className="w-full px-4 min-[20rem]:w-auto min-[20rem]:px-7">
              {refusal?.error.code === "INTERNAL" ? t("account.profile.retry") : t("account.profile.save")}
            </SubmitButton>
            <p role="status" className="font-semibold">
              {saved && !pending ? t("account.profile.saved") : ""}
            </p>
          </div>
        </Form>
      </div>
    </AccountFrame>
  );
}

/** The profile read failed: a calm message with a retry (AC3). */
export function ErrorBoundary() {
  const { t } = useI18n();
  return (
    <Alert tone="danger" role="alert" title={t("account.profile.failed")} className="mx-auto max-w-2xl">
      <a href="" className="inline-flex min-h-11 items-center font-semibold link">
        {t("account.profile.retry")}
      </a>
    </Alert>
  );
}
