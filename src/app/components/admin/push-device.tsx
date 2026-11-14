// "Push on this device" (S-197 AC2-AC4; S-196 AC1, AC2): what this phone can do, Enable /
// Turn off, and "Send test push". The service worker is the admin app's /admin/sw.js (S-035),
// which already shows `{ title, body, url, tag }` and opens `url` when tapped. Every step gives
// feedback at once (busy buttons, status text in a polite live region); a failure says what to
// do next instead of failing silently.
import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { SubmitButton } from "~/components/ui/submit-button";
import { useI18n } from "~/i18n/react";
import { type PushDeviceState, applicationServerKey, pushDeviceState } from "~/lib/push-device";

type TestResult = { ok: true; intent: "sendTestPush"; sent: number; configured?: false } | { ok: false };

const SW_URL = "/admin/sw.js";

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/admin/")) ?? navigator.serviceWorker.register(SW_URL, { scope: "/admin/" });
}

function supported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;
}

function standalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  return (await registration()).pushManager.getSubscription();
}

async function readState(serverKey: string | null): Promise<{ state: PushDeviceState; subscription: PushSubscription | null }> {
  const subscription = serverKey ? await currentSubscription().catch(() => null) : null;
  const state = pushDeviceState({
    serverKey,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: standalone(),
    supported: supported(),
    permission: typeof Notification === "undefined" ? "unavailable" : Notification.permission,
    subscribed: subscription !== null,
  });
  return { state, subscription };
}

/** The browser subscription as the flat fields `subscribePush` takes. */
function subscriptionForm(subscription: PushSubscription): Record<string, string> {
  const json = subscription.toJSON();
  return { intent: "subscribePush", endpoint: json.endpoint ?? "", "keys.p256dh": json.keys?.p256dh ?? "", "keys.auth": json.keys?.auth ?? "" };
}

function useDevicePush(serverKey: string | null) {
  const sync = useFetcher({ key: "profile-push-subscription" });
  const [state, setState] = useState<PushDeviceState>("checking");
  const [busy, setBusy] = useState<"enable" | "disable" | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void readState(serverKey).then(({ state: next, subscription }) => {
      if (!live) return;
      setState(next);
      // A device the server dropped (410 cleanup, deactivation) is quietly registered again.
      if (subscription) void sync.submit(subscriptionForm(subscription), { method: "post", action: "/admin/profile" });
    });
    return () => void (live = false);
    // `sync` is stable per key; reading once per page view is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const enable = useCallback(async () => {
    if (!serverKey) return;
    setBusy("enable");
    setFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const subscription = await (await registration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(serverKey) });
      await sync.submit(subscriptionForm(subscription), { method: "post", action: "/admin/profile" });
      setState("on");
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [serverKey, sync]);

  const disable = useCallback(async () => {
    setBusy("disable");
    setFailed(false);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await sync.submit({ intent: "unsubscribePush", endpoint: subscription.endpoint }, { method: "post", action: "/admin/profile" });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [sync]);

  return { state, busy, failed, enable, disable };
}

function TestPush({ devices }: { devices: number }) {
  const { t } = useI18n();
  const fetcher = useFetcher<TestResult>({ key: "profile-sendTestPush" });
  const pending = fetcher.state !== "idle";
  const result = pending ? undefined : fetcher.data;
  let message = "";
  if (result && !result.ok) message = t("admin.profile.testFailed");
  else if (result?.ok) message = result.sent > 0 ? t("admin.profile.testSent", { count: result.sent }) : t("admin.profile.testNone");
  return (
    <fetcher.Form method="post" action="/admin/profile" className="grid gap-2">
      <input type="hidden" name="intent" value="sendTestPush" />
      <div>
        <SubmitButton pending={pending} pendingText={t("admin.profile.testSending")} pendingLabel={t("admin.profile.testSending")} variant="outline" size="lg" className="w-full sm:w-auto">
          {t("admin.profile.testPush")}
        </SubmitButton>
      </div>
      <p role="status" aria-live="polite" className="font-semibold">
        {message}
      </p>
      {devices === 0 && !result && <p className="text-sm text-muted-foreground">{t("admin.profile.testNone")}</p>}
    </fetcher.Form>
  );
}

export function PushDevice({ serverKey, devices }: { serverKey: string | null; devices: number }) {
  const { t } = useI18n();
  const { state, busy, failed, enable, disable } = useDevicePush(serverKey);
  const canTest = state !== "serverOff" && state !== "checking";
  return (
    <div role="group" className="grid gap-3 rounded-md border border-border p-2 min-[20rem]:p-4" aria-labelledby="push-device-title">
      <h3 id="push-device-title" className="text-lg">
        {t("admin.profile.pushDeviceTitle")}
      </h3>
      <p role="status" aria-live="polite" aria-busy={state === "checking" || undefined}>
        {t(`admin.profile.pushState.${state}`)}
      </p>
      {state === "off" && (
        <form onSubmit={(event) => (event.preventDefault(), void enable())}>
          <SubmitButton pending={busy === "enable"} pendingText={t("admin.profile.enablingPush")} pendingLabel={t("admin.profile.enablingPush")} size="lg" className="w-full sm:w-auto">
            {t("admin.profile.enablePush")}
          </SubmitButton>
        </form>
      )}
      {state === "on" && (
        <form onSubmit={(event) => (event.preventDefault(), void disable())}>
          <SubmitButton pending={busy === "disable"} pendingText={t("admin.profile.disablingPush")} pendingLabel={t("admin.profile.disablingPush")} variant="outline" size="lg" className="w-full sm:w-auto">
            {t("admin.profile.disablePush")}
          </SubmitButton>
        </form>
      )}
      {failed && (
        <p role="alert" className="font-semibold text-destructive">
          {t("admin.profile.pushFailed")}
        </p>
      )}
      <p className="text-sm">{t("admin.profile.pushDevices", { count: devices })}</p>
      {canTest && <TestPush devices={devices} />}
    </div>
  );
}
