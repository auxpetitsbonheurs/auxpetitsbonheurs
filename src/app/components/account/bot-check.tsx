// Turnstile on the account forms (E-11 S-206, S-207, S-208, S-209, S-215; reuses E-08's
// `useTurnstile`). The widget is invisible unless Cloudflare needs an interaction (no puzzles,
// S-206 AC10); the form posts the latest token and the server verifies it (BOT_CHECK_FAILED).
// Without a configured site key nothing renders and the server skips the check.
import { useRouteLoaderData } from "react-router";
import { useI18n } from "~/i18n/react";
import { useTurnstile } from "~/lib/use-turnstile";

export function BotCheck() {
  const { t, locale } = useI18n();
  const layout = useRouteLoaderData(`account-${locale}`) as { turnstileSiteKey?: string | null } | undefined;
  const { state, token, containerRef } = useTurnstile(layout?.turnstileSiteKey ?? null, locale);
  if (state === "off") return null;
  return (
    <div>
      <input type="hidden" name="turnstileToken" value={token} />
      <div ref={containerRef} />
      <p role="status" className="text-sm text-muted-foreground">
        {state === "failed" ? t("account.common.botFailed") : state === "loading" || !token ? t("account.common.botLoading") : ""}
      </p>
    </div>
  );
}
