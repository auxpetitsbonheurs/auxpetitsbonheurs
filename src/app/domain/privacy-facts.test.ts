// S-225 AC6, AC7 (NFR-004): the periods the privacy note states are the ones the jobs apply, and
// every Owner decision still open is named rather than invented.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { retentionCutoff } from "~/jobs/anonymise-inactive";
import { RETENTION_DAYS } from "~/jobs/purge-emails";
import { RATE_LIMIT_RETENTION_MS } from "~/server/rate-limit.server";
import { ORPHAN_UPLOAD_MS } from "./custom-request";
import { PRIVACY_FACTS, RETENTION, openPrivacyItems, privacyFactsWith } from "./privacy-facts";

describe("retention stated = retention applied (AC6)", () => {
  test("email contents: the purge-emails job's 90 days", () => {
    expect(RETENTION.emailContentDays).toBe(RETENTION_DAYS);
  });

  test("abuse counters: the rate-limit purge's one day", () => {
    expect(RETENTION.rateLimitDays * 24 * 60 * 60 * 1000).toBe(RATE_LIMIT_RETENTION_MS);
  });

  test("unused request photos: the 24 h purge queue", () => {
    expect(RETENTION.unusedUploadHours * 60 * 60 * 1000).toBe(ORPHAN_UPLOAD_MS);
  });

  test("orders and contact details: the anonymise job's cutoff is RETENTION.orderYears before today (PRV-02)", () => {
    const now = new Date("2026-11-01T00:10:00Z");
    expect(retentionCutoff(now).getUTCFullYear()).toBe(2026 - RETENTION.orderYears);
    expect(readFileSync(new URL("../jobs/anonymise-inactive.ts", import.meta.url), "utf8")).toContain("RETENTION.orderYears");
  });

  test("custom cake photos: purge-storage reads RETENTION.requestPhotoDays (PRV-03)", () => {
    expect(readFileSync(new URL("../jobs/purge-storage.ts", import.meta.url), "utf8")).toContain("RETENTION.requestPhotoDays");
  });

  test("backups: the workflow keeps the latest 8", () => {
    const workflow = readFileSync(new URL("../../../.github/workflows/backup.yml", import.meta.url), "utf8");
    expect(workflow).toContain(`Keep the latest ${RETENTION.backupWeeks}`);
  });
});

describe("open [TO CONFIRM] items (AC7)", () => {
  test("each undecided fact is listed by name", () => {
    expect(openPrivacyItems({ ...PRIVACY_FACTS, legalName: null, address: "x", brn: "x", databaseRegion: "x", regimeConfirmed: true, retentionConfirmed: false })).toEqual(["legalName", "retention"]);
  });

  test("nothing is open once the Owner has decided everything", () => {
    expect(openPrivacyItems({ updatedOn: "2026-11-13", legalName: "A", address: "B", brn: "C", databaseRegion: "D", regimeConfirmed: true, retentionConfirmed: true })).toEqual([]);
  });

  test("today the business facts and retention are still the Owner's to confirm (not invented)", () => {
    expect(openPrivacyItems(PRIVACY_FACTS)).toEqual(["legalName", "address", "brn", "databaseRegion", "regime", "retention"]);
  });
});

describe("business facts from Settings → Invoice (S-127)", () => {
  test("the legal name, BRN and address typed once in Settings fill the note; the address reads as one line", () => {
    const facts = privacyFactsWith({ legalName: "Example Bakery Ltd", brn: "C00000000", address: "1 Example Street\n Example Town \n" });

    expect(facts).toMatchObject({ legalName: "Example Bakery Ltd", brn: "C00000000", address: "1 Example Street, Example Town" });
    expect(openPrivacyItems(facts)).toEqual(["databaseRegion", "regime", "retention"]);
  });

  test("an empty or blank Setting falls back to the to-be-confirmed placeholder", () => {
    const facts = privacyFactsWith({ legalName: "  ", brn: null, address: "" });

    expect(facts).toEqual(PRIVACY_FACTS);
    expect(openPrivacyItems(facts)).toContain("legalName");
  });
});
