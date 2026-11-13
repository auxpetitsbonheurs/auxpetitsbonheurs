// S-197 AC2, AC3: which push row the profile shows.
import { describe, expect, test } from "vitest";
import { type PushEnvironment, pushDeviceState } from "./push-device";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const base: PushEnvironment = { serverKey: "key", userAgent: ANDROID, standalone: false, supported: true, permission: "default", subscribed: false };

describe("pushDeviceState", () => {
  test("push is off on this device until enabled (AC2)", () => {
    expect(pushDeviceState(base)).toBe("off");
    expect(pushDeviceState({ ...base, permission: "granted", subscribed: true })).toBe("on");
  });

  test("blocked notifications ask to allow them in settings (AC3)", () => {
    expect(pushDeviceState({ ...base, permission: "denied" })).toBe("blocked");
  });

  test("iPhone Safari not installed: Add to Home Screen first (AC3); installed it can enable", () => {
    expect(pushDeviceState({ ...base, userAgent: IPHONE, supported: false, permission: "unavailable" })).toBe("install");
    expect(pushDeviceState({ ...base, userAgent: IPHONE, standalone: true })).toBe("off");
  });

  test("no Web Push in this browser", () => {
    expect(pushDeviceState({ ...base, supported: false })).toBe("unsupported");
  });

  test("without the server's VAPID key push is off for everyone, whatever the device", () => {
    expect(pushDeviceState({ ...base, serverKey: null, subscribed: true })).toBe("serverOff");
  });
});
