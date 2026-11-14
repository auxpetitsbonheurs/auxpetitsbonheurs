// What the profile's "Push on this device" row shows (S-197 AC2, AC3; spec UX "Admin profile >
// Alerts"), as a pure decision on what the browser and server report, unit-tested without a phone.
//   serverOff   - the VAPID keys are not set yet: push is off for everyone, email still works
//   install     - iOS Safari, not installed: "Add to Home Screen first" (iOS pushes to installed apps only)
//   unsupported - this browser has no Web Push
//   blocked     - notifications were refused: "Allow notifications in settings"
//   off         - can be enabled here: "Push is off on this device" + Enable
//   on          - this device is subscribed
import { isIosSafari } from "./install-hint";

export type PushDeviceState = "checking" | "serverOff" | "install" | "unsupported" | "blocked" | "off" | "on";

export interface PushEnvironment {
  /** The server's VAPID public key; null while push is not configured. */
  serverKey: string | null;
  userAgent: string;
  maxTouchPoints?: number;
  standalone: boolean;
  /** `serviceWorker` in navigator and `PushManager` in window. */
  supported: boolean;
  permission: NotificationPermission | "unavailable";
  subscribed: boolean;
}

export function pushDeviceState(env: PushEnvironment): PushDeviceState {
  if (!env.serverKey) return "serverOff";
  if (!env.standalone && isIosSafari(env.userAgent, env.maxTouchPoints)) return "install";
  if (!env.supported || env.permission === "unavailable") return "unsupported";
  if (env.permission === "denied") return "blocked";
  return env.subscribed ? "on" : "off";
}

/** base64url to bytes for `pushManager.subscribe({ applicationServerKey })`. */
export function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
