// S-035 AC3-AC5: which install offer shows, from the user agent, standalone mode, a deferred
// install prompt and an earlier dismissal.
import { describe, expect, test } from "vitest";
import { installOffer, isIosSafari } from "./install-hint";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

const base = { standalone: false, dismissed: false, promptAvailable: false };

describe("isIosSafari", () => {
  test.each([
    ["iPhone Safari", UA.iphoneSafari, 5, true],
    ["iPadOS Safari (Mac user agent with touch)", UA.ipadOs, 5, true],
    ["Mac Safari (no touch)", UA.macSafari, 0, false],
    ["Chrome on iPhone", UA.iphoneChrome, 5, false],
    ["Firefox on iPhone", UA.iphoneFirefox, 5, false],
    ["Instagram's in-app browser", UA.iphoneInstagram, 5, false],
    ["Android Chrome", UA.androidChrome, 5, false],
  ])("%s -> %s", (_label, ua, touch, expected) => {
    expect(isIosSafari(ua, touch)).toBe(expected);
  });
});

describe("installOffer", () => {
  test("AC3: a deferred install prompt (Android Chrome) offers the Install button", () => {
    expect(installOffer({ ...base, userAgent: UA.androidChrome, promptAvailable: true })).toBe("prompt");
  });

  test("AC3: once Not now was pressed, it does not return in this browser", () => {
    expect(installOffer({ ...base, userAgent: UA.androidChrome, promptAvailable: true, dismissed: true })).toBeNull();
  });

  test("AC4: iOS Safari not installed shows the one-line hint; dismissed, it stays hidden", () => {
    expect(installOffer({ ...base, userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe("iosHint");
    expect(installOffer({ ...base, userAgent: UA.iphoneSafari, maxTouchPoints: 5, dismissed: true })).toBeNull();
  });

  test("AC4: any other browser without a prompt shows nothing", () => {
    expect(installOffer({ ...base, userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBeNull();
    expect(installOffer({ ...base, userAgent: UA.androidChrome })).toBeNull();
    expect(installOffer({ ...base, userAgent: UA.macSafari })).toBeNull();
  });

  test("AC5: installed (standalone) shows neither prompt nor hint", () => {
    expect(installOffer({ ...base, userAgent: UA.iphoneSafari, maxTouchPoints: 5, standalone: true })).toBeNull();
    expect(installOffer({ ...base, userAgent: UA.androidChrome, promptAvailable: true, standalone: true })).toBeNull();
  });
});
