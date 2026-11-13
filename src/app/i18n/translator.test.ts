// Parity with i18next (dev dependency only): the local translator replaced it in the
// client bundle (NFR-001), so every catalogue key must read exactly as it did before.
import i18next from "i18next";
import { describe, expect, test } from "vitest";
import type { Locale } from "~/lib/locale";
import { messagesFor } from "./catalog.server";
import { type Messages, type TranslationValues, createTranslator } from "./translator";

function i18nextTranslator(locale: Locale, messages: Messages) {
  const i18n = i18next.createInstance();
  void i18n.init({
    initAsync: false,
    lng: locale,
    fallbackLng: false,
    resources: { [locale]: { translation: messages } },
    nsSeparator: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    showSupportNotice: false,
  } as Parameters<typeof i18n.init>[0]);
  return (key: string, values?: TranslationValues) => (i18n.exists(key, values) ? (i18n.t(key, values) as string) : key);
}

/** Every key a component can ask for: leaf paths, plus plural bases without their suffix. */
function askableKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "object"
      ? askableKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`, `${prefix}${key.replace(/_(zero|one|two|few|many|other)$/, "")}`],
  );
}

const valueSets: (TranslationValues | undefined)[] = [
  undefined,
  {},
  { count: 0, n: 2, name: "Ana $& <b>", max: 280, group: "Size", price: "Rs 1,200", date: "Fri 3 May" },
  { count: 1, name: "Zoé", email: "a@b.mu" },
  { count: 2, max: 10, window: "10:00–12:00" },
  { count: 1.5 },
  { count: 1_000_000, number: 7 },
  { count: "3" },
];

describe.each(["en", "fr"] as const)("translator parity with i18next (%s)", (locale) => {
  const messages = messagesFor(locale);
  const local = createTranslator(locale, messages, { mode: "production" });
  const reference = i18nextTranslator(locale, messages);
  const keys = [...new Set(askableKeys(messages))];

  test.each(valueSets.map((values) => [JSON.stringify(values), values] as const))("every key with values %s", (_, values) => {
    const mismatches = keys
      .map((key) => ({ key, local: local(key, values), reference: reference(key, values) }))
      .filter((row) => row.local !== row.reference);
    expect(mismatches).toEqual([]);
  });
});

describe("translator edge cases", () => {
  const messages: Messages = {
    a: "Hi {{name}} {{ name }} {{other}}",
    p_one: "one {{count}}",
    p_other: "many {{count}}",
    r_one: "r one",
    r: "r plain",
    "dot.key": "flat",
    e: "",
  };
  const local = createTranslator("fr", messages, { mode: "production" });
  const reference = i18nextTranslator("fr", messages);

  test.each([
    ["a", { name: "Z" }],
    ["a", undefined],
    ["p", { count: 0 }],
    ["p", { count: 1_000_000 }],
    ["p", { count: "2" }],
    ["p", undefined],
    ["r", { count: 2 }],
    ["dot.key", undefined],
    ["e", undefined],
    ["p_one", undefined],
  ] as [string, TranslationValues | undefined][])("%s %j reads as i18next", (key, values) => {
    expect(local(key, values)).toBe(reference(key, values));
  });
});
