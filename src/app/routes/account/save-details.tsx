// `account/save-details` (`/account/save-details?t=<tracking token>`; S-215, contracts.md). The
// tracking token is the credential: it names the order whose email gets an account. One tap, no
// password (threat-model G-01): an unconfirmed account and the confirmation email; nothing is
// linked and no history is shown until the email is confirmed (S-216). RL-signup per IP.
import { Form, Link, data } from "react-router";
import { AuthCard, FocusedStatus, RefusalAlert, isRefusal, usePosting } from "~/components/account/account-ui";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { SubmitButton } from "~/components/ui/submit-button";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { rateLimitedResult } from "~/server/auth-rate-limit.server";
import { pageLocale } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { assertSameOrigin } from "~/server/origin.server";
import { isTrackingToken } from "~/server/token-page.server";
import { findSaveDetailsOrder } from "~/server/repos/customer-accounts.server";
import { consumeSignUp, saveDetailsAccount } from "~/server/services/customer-auth.server";
import { recordUsage } from "~/server/usage.server";
import type { Route } from "./+types/save-details";

async function orderFor(args: Route.LoaderArgs | Route.ActionArgs, token: unknown) {
  // A malformed token never reaches the database; unknown and wrong answer alike (AC6).
  if (typeof token !== "string" || !isTrackingToken(token)) return null;
  return findSaveDetailsOrder(args.context.get(requestDbContext).db, token);
}

export async function loader(args: Route.LoaderArgs) {
  const token = args.url.searchParams.get("t") ?? "";
  const order = await orderFor(args, token);
  if (!order) throw data(null, { status: 404 });
  return { token, email: order.email, title: translate("account.saveDetails.title", pageLocale(args)) };
}

export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const locale = pageLocale(args);
  const form = Object.fromEntries(await args.request.formData());
  const limit = await consumeSignUp(args, "customer.saveDetails");
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, {});
  const order = await orderFor(args, form.trackingToken);
  if (!order) return actionError("NOT_FOUND", locale);
  const outcome = await saveDetailsAccount(args, order);
  if (outcome === "in_use") return actionError("EMAIL_IN_USE", locale);
  await recordUsage(args, "save_details_completed");
  return { ok: true as const, confirmationSent: true as const };
}

export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export default function SaveDetails({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const pending = usePosting();
  const refusal = isRefusal(actionData) ? actionData : undefined;
  if (actionData && !refusal) {
    return (
      <AuthCard title={t("account.saveDetails.title")}>
        <FocusedStatus title={t("account.signUp.checkTitle")}>
          <p className="mt-1 wrap-anywhere">{t("account.saveDetails.checkBody", { email: loaderData.email })}</p>
        </FocusedStatus>
      </AuthCard>
    );
  }
  if (refusal?.error.code === "EMAIL_IN_USE") {
    return (
      <AuthCard title={t("account.saveDetails.title")}>
        <Alert tone="info" role="status" className="mt-6">
          <p className="font-semibold">{t("account.saveDetails.inUse")}</p>
        </Alert>
        <Link to={localePath(locale, "/account/sign-in")} className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}>
          {t("account.signIn.submit")}
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("account.saveDetails.title")} intro={t("account.saveDetails.intro")}>
      <p className="mt-4 font-semibold wrap-anywhere">{loaderData.email}</p>
      <RefusalAlert
        refusal={refusal ? { ...refusal, retryAfterMinutes: undefined } : undefined}
        anchors={{}}
        message={refusal?.retryAfterMinutes !== undefined ? t("account.signIn.tooMany", { count: refusal.retryAfterMinutes }) : undefined}
      />
      <Form method="post" className="mt-6">
        <input type="hidden" name="trackingToken" value={loaderData.token} />
        <SubmitButton pending={pending} pendingText={t("account.signUp.creating")} size="lg" className="w-full">
          {t("account.saveDetails.submit")}
        </SubmitButton>
      </Form>
      <p className="mt-4 text-sm text-muted-foreground">{t("account.saveDetails.note")}</p>
    </AuthCard>
  );
}
