// `admin/availability` saveRules (S-056 AC2, AC3, AC5, AC6, AC7) through the route action:
// valid rules are stored with version + 1; every bad field is named and nothing is saved;
// window ids are kept; closing a weekday lists its active orders and changes none.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { action, loader } from "~/routes/admin/availability";
import { loader as basketLoader } from "~/routes/site/basket";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Refusal = { data: { ok: false; intent?: string; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };
type Window = { id: string; start: string; end: string; label: { en: string; fr?: string } };

function windowFields(list: string, windows: Window[]): Record<string, string> {
  return Object.fromEntries(
    windows.flatMap((w, i) => [
      [`${list}.${i}.id`, w.id],
      [`${list}.${i}.start`, w.start],
      [`${list}.${i}.end`, w.end],
      [`${list}.${i}.label.en`, w.label.en],
      [`${list}.${i}.label.fr`, w.label.fr ?? ""],
    ]),
  );
}

const DEFAULT: Window[] = [
  { id: "morning", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } },
  { id: "afternoon", start: "12:00", end: "17:00", label: { en: "Afternoon", fr: "Après-midi" } },
  { id: "evening", start: "17:00", end: "20:00", label: { en: "Evening", fr: "Soir" } },
];

function rulesForm(options: { version?: string; notice?: string; closed?: string[]; delivery?: Window[]; pickup?: Window[] } = {}) {
  return {
    intent: "saveRules",
    version: options.version ?? "1",
    defaultNoticeDays: options.notice ?? "3",
    closedWeekdays: options.closed ?? ["7"],
    ...windowFields("deliveryWindows", options.delivery ?? DEFAULT),
    ...windowFields("pickupWindows", options.pickup ?? DEFAULT),
  };
}

async function post(form: Record<string, string | string[]>) {
  const session = await signedInAdmin(database, { role: "owner" });
  return (await action(routeArgs(database, { path: "/admin/availability", auth: session.auth, cookie: session.cookie, form }) as never)) as unknown;
}

const rules = async () =>
  (await database.client.query<{ version: number; default_notice_days: number; closed_weekdays: number[]; delivery_windows: Window[]; pickup_windows: Window[] }>(
    "select version, default_notice_days, closed_weekdays, delivery_windows, pickup_windows from settings",
  )).rows[0]!;

describe("S-056 AC1: the page shows the launch rules", () => {
  test("notice 3, Sunday closed, Morning/Afternoon/Evening for delivery and pickup, no blocks", async () => {
    const session = await signedInAdmin(database, { role: "owner" });
    const page = await loader(routeArgs(database, { path: "/admin/availability", auth: session.auth, cookie: session.cookie }) as never);

    expect(page).toMatchObject({ defaultNoticeDays: 3, closedWeekdays: [7], deliveryWindows: DEFAULT, pickupWindows: DEFAULT, blocks: [], version: 1 });
  });
});

describe("S-056 AC2: valid rules are stored", () => {
  test("notice 0..60, some days closed, different delivery and pickup lists; version + 1", async () => {
    const pickup: Window[] = [{ id: "w-a1b2c3", start: "10:00", end: "14:00", label: { en: "Late morning" } }];

    const answer = await post(rulesForm({ notice: "60", closed: ["1", "7"], pickup }));

    expect(answer).toMatchObject({ ok: true, intent: "saveRules", version: 2, affectedOrders: [] });
    expect(await rules()).toEqual({ version: 2, default_notice_days: 60, closed_weekdays: [1, 7], delivery_windows: DEFAULT, pickup_windows: pickup });
  });
});

describe("S-056 AC3: invalid rules are refused and nothing is saved", () => {
  test.each([
    ["notice 61", rulesForm({ notice: "61" }), { defaultNoticeDays: "Enter the notice as a whole number of days from 0 to 60." }],
    ["all seven days closed", rulesForm({ closed: ["1", "2", "3", "4", "5", "6", "7"] }), { closedWeekdays: "Keep at least one day open." }],
    [
      "overlapping windows",
      rulesForm({ delivery: [DEFAULT[0]!, { id: "late", start: "11:00", end: "13:00", label: { en: "Late" } }] }),
      { deliveryWindows: "Delivery windows overlap. Change the times so they do not." },
    ],
    ["a window ending before it starts", rulesForm({ pickup: [{ id: "x", start: "14:00", end: "10:00", label: { en: "Odd" } }] }), { "pickupWindows.0.end": "Pickup window 1: the end must be after the start." }],
    ["an empty list", { ...rulesForm(), ...Object.fromEntries(Object.keys(windowFields("pickupWindows", DEFAULT)).map((k) => [k, ""])) }, null],
  ])("%s", async (_name, form, fields) => {
    const refused = (await post(form)) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
    if (fields) expect(refused.data.error.fields).toEqual(fields);
    expect((await rules()).version).toBe(1);
  });

  test("no window posted at all, and seven windows, are refused on the list", async () => {
    const { closedWeekdays, defaultNoticeDays, version, intent } = rulesForm();
    const none = (await post({ intent, version, defaultNoticeDays, closedWeekdays, ...windowFields("deliveryWindows", DEFAULT) })) as Refusal;
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `w${i}`, start: `${String(8 + i).padStart(2, "0")}:00`, end: `${String(8 + i).padStart(2, "0")}:30`, label: { en: `Slot ${i}` } }));
    const tooMany = (await post(rulesForm({ delivery: seven }))) as Refusal;

    expect(none.data.error.fields).toEqual({ pickupWindows: "Add at least one pickup window." });
    expect(tooMany.data.error.fields).toEqual({ deliveryWindows: "Keep 6 delivery windows at most." });
    expect((await rules()).version).toBe(1);
  });

  test("a bad time names its window and the format", async () => {
    const refused = (await post(rulesForm({ delivery: [{ id: "morning", start: "9am", end: "12:00", label: { en: "" } }] }))) as Refusal;

    expect(refused.data.error.fields).toEqual({
      "deliveryWindows.0.start": "Delivery window 1: enter the start as HH:mm, for example 09:00.",
      "deliveryWindows.0.label.en": "Delivery window 1: enter a name in English.",
    });
  });
});

describe("S-056 AC5: window ids are stable and orders keep their snapshot", () => {
  test("renaming and moving a window keeps its id; an earlier order keeps the window it was placed with", async () => {
    const { token } = await placeTestOrder(database); // pickup, "morning"
    const renamed: Window[] = [{ id: "morning", start: "08:00", end: "11:00", label: { en: "Early", fr: "Tôt" } }];

    expect(await post(rulesForm({ pickup: renamed }))).toMatchObject({ ok: true });

    expect((await rules()).pickup_windows).toEqual(renamed);
    const order = await database.client.query("select time_window from orders where tracking_token = $1", [token]);
    expect(order.rows[0]).toEqual({ time_window: { id: "morning", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } } });
  });
});

describe("S-056 AC6: closing a weekday with active orders", () => {
  test("lists those orders as a warning, saves the rules and leaves the orders unchanged", async () => {
    // placeTestOrder books Thursday 2026-11-12 (ISO weekday 4).
    const { token } = await placeTestOrder(database);
    const before = await database.client.query("select status, version from orders");

    const answer = await post(rulesForm({ closed: ["4", "7"] }));

    expect(answer).toMatchObject({ ok: true, version: 2, affectedOrders: [{ number: "APB-0001", status: "awaiting_payment", fulfilOn: "2026-11-12", contactName: "Aisha", dateLabel: "Thu 12 Nov" }] });
    expect((await database.client.query("select status, version from orders")).rows).toEqual(before.rows);
    expect(token).toBeTruthy();
  });

  test("a weekday that was already closed lists nothing", async () => {
    await placeTestOrder(database, { overrides: { date: "2026-11-14" } }); // Saturday
    await post(rulesForm({ closed: ["6", "7"] }));

    expect(await post(rulesForm({ version: "2", closed: ["6", "7"] }))).toMatchObject({ ok: true, affectedOrders: [] });
  });
});

describe("S-056 AC4: checkout uses the edited windows", () => {
  test("the basket shows the new delivery and pickup lists, and a window no longer listed is refused on submit", async () => {
    const delivery: Window[] = [{ id: "midday", start: "11:00", end: "14:00", label: { en: "Midday" } }];
    expect(await post(rulesForm({ delivery, pickup: [DEFAULT[0]!] }))).toMatchObject({ ok: true });

    const basket = await basketLoader(routeArgs(database, { path: "/basket" }) as never);
    expect(basket.menu.data.checkout.windows.delivery.map((w) => w.id)).toEqual(["midday"]);
    expect(basket.menu.data.checkout.windows.pickup.map((w) => w.id)).toEqual(["morning"]);
    await expect(placeTestOrder(database, { overrides: { "windowId.pickup": "evening" } })).rejects.toThrow(/windowId/);
    await expect(placeTestOrder(database, { overrides: { "windowId.pickup": "morning" } })).resolves.toMatchObject({ token: expect.any(String) });
  });
});

describe("S-056 AC7: a stale version", () => {
  test("the second Owner's save is SETTINGS_CHANGED and nothing is saved", async () => {
    expect(await post(rulesForm({ notice: "5" }))).toMatchObject({ ok: true });

    const refused = (await post(rulesForm({ notice: "7" }))) as Refusal;

    expect(refused.init.status).toBe(409);
    expect(refused.data.error).toEqual({ code: "SETTINGS_CHANGED", message: "Someone changed this. Reload." });
    expect(await rules()).toMatchObject({ version: 2, default_notice_days: 5 });
  });
});
