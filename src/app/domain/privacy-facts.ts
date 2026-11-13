// The facts the privacy note states (S-225, NFR-004). Every value here is the Owner's decision;
// `null` is an open `[TO CONFIRM]` item (PRD Q12): the page shows "to be confirmed" in its place
// and stays out of search results until none is left (production/audits/privacy-2026.md lists
// the questions). Retention periods match the jobs that apply them (app/jobs/*).

export interface PrivacyFacts {
  /** Date the note last changed (YYYY-MM-DD). */
  updatedOn: string;
  /** Legal name of the business that decides about the data (the controller). */
  legalName: string | null;
  /** Its registered or postal address. */
  address: string | null;
  /** Business Registration Number. */
  brn: string | null;
  /** Where the database is hosted (Supabase region of the live project), e.g. "Singapore". */
  databaseRegion: string | null;
  /** The Owner confirmed that the Mauritius Data Protection Act 2017 is the regime that applies. */
  regimeConfirmed: boolean;
  /** The Owner chose the retention periods below (the proposed defaults until then). */
  retentionConfirmed: boolean;
}

/** Retention in days or years, as the purge jobs apply them. */
export const RETENTION = {
  /** Orders and their contact details (accounting records), then anonymised. Proposed default. */
  orderYears: 5,
  /** Photos sent with a custom cake request, after the request is closed. Proposed default. */
  requestPhotoDays: 90,
  /** Photos uploaded but never sent with a request (jobs/purge-storage, 24 h queue). */
  unusedUploadHours: 24,
  /** Email contents (jobs/purge-emails RETENTION_DAYS). */
  emailContentDays: 90,
  /** Hashed IP and email counters for abuse limits (rate-limit RATE_LIMIT_RETENTION_MS). */
  rateLimitDays: 1,
  /** Weekly backups kept (backup workflow). */
  backupWeeks: 8,
  /** The Owner answers an erase request within this many days. */
  eraseDays: 30,
} as const;

export const PRIVACY_FACTS: PrivacyFacts = {
  updatedOn: "2026-11-13",
  legalName: null,
  address: null,
  brn: null,
  databaseRegion: null,
  regimeConfirmed: false,
  retentionConfirmed: false,
};

/** The open `[TO CONFIRM]` items, by name (empty when the Owner has decided everything). */
export function openPrivacyItems(facts: PrivacyFacts): string[] {
  const open: string[] = [];
  for (const key of ["legalName", "address", "brn", "databaseRegion"] as const) if (facts[key] === null) open.push(key);
  if (!facts.regimeConfirmed) open.push("regime");
  if (!facts.retentionConfirmed) open.push("retention");
  return open;
}
