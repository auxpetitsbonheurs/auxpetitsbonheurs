// S-035 AC2: the service worker's push and notificationclick handlers, run as the exact
// script the browser gets, against a fake service-worker global.
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { SERVICE_WORKER_SOURCE } from "./sw-handlers";

type Listener = (event: Record<string, unknown>) => void;

function install(windows: { url: string }[] = []) {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const focusedWindows = windows.map((w) => ({ url: w.url, navigate: async (url: string) => void navigated.push(url) }));
  const clientWindows = focusedWindows.map((w) => ({ url: w.url, focus: async () => w }));
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: { matchAll: async () => clientWindows, openWindow: async (url: string) => void opened.push(url), claim: async () => undefined },
  };
  runInNewContext(SERVICE_WORKER_SOURCE, { self, URL });
  const fire = async (type: string, event: Record<string, unknown>) => {
    let work: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => (work = promise) });
    await work;
  };
  return { listeners, shown, opened, navigated, fire };
}

const pushEvent = (payload: unknown) => ({ data: { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) } });
const clickEvent = (url: unknown) => {
  const notification = { data: { url }, closed: false, close: () => (notification.closed = true) };
  return { notification };
};

describe("push", () => {
  test("shows the payload's title and body, with its tag and url", async () => {
    const sw = install();

    await sw.fire("push", pushEvent({ title: "New order APB-0042", body: "Aisha, Sat 14 Nov", url: "/admin/orders/abc", tag: "order-abc" }));

    expect(sw.shown).toEqual([
      {
        title: "New order APB-0042",
        options: { body: "Aisha, Sat 14 Nov", data: { url: "/admin/orders/abc" }, icon: "/admin/icon-192.png", badge: "/admin/icon-192.png", tag: "order-abc" },
      },
    ]);
  });

  test("an empty or unreadable payload still shows the bakery's name and opens /admin", async () => {
    const sw = install();

    await sw.fire("push", { data: null });
    await sw.fire("push", pushEvent("{not json"));

    expect(sw.shown.map((n) => [n.title, (n.options.data as { url: string }).url])).toEqual([
      ["Aux petits bonheurs", "/admin"],
      ["Aux petits bonheurs", "/admin"],
    ]);
  });
});

describe("notificationclick", () => {
  test("closes the notification and opens data.url when no admin tab is open", async () => {
    const sw = install([{ url: "https://bakery.example/menu" }]);
    const event = clickEvent("/admin/calendar/2026-11-13/prep");

    await sw.fire("notificationclick", event);

    expect(event.notification.closed).toBe(true);
    expect(sw.opened).toEqual(["/admin/calendar/2026-11-13/prep"]);
  });

  test("focuses an open admin tab and takes it to data.url", async () => {
    const sw = install([{ url: "https://bakery.example/admin/menu" }]);

    await sw.fire("notificationclick", clickEvent("/admin/orders/abc"));

    expect(sw.navigated).toEqual(["/admin/orders/abc"]);
    expect(sw.opened).toEqual([]);
  });

  test.each(["https://evil.example/admin", "//evil.example/admin", "/administrator", "/\\evil.example", "/basket", 42, undefined])(
    "never follows %s outside the admin app: opens /admin",
    async (url) => {
      const sw = install();

      await sw.fire("notificationclick", clickEvent(url));

      expect(sw.opened).toEqual(["/admin"]);
    },
  );
});

test("no fetch handler and no cache: nothing about admin data stays on the device (AC6)", () => {
  const sw = install();

  expect([...sw.listeners.keys()].sort()).toEqual(["activate", "install", "notificationclick", "push"]);
  expect(SERVICE_WORKER_SOURCE).not.toMatch(/caches|indexedDB|localStorage|fetch/);
});
