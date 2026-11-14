/** Shapes stored in jsonb columns. Validated with zod at the write boundary. */

/** Customer-facing text; a missing `fr` falls back to `en` (NFR-007). */
export type LocalizedText = { en: string; fr?: string };

/** A delivery or pickup window, "HH:mm" in Mauritius time. Snapshotted onto orders. */
export type TimeWindow = {
  id: string;
  start: string;
  end: string;
  label: LocalizedText;
};

/** One chosen option on an order item, copied at placement (FR-012). */
export type OrderItemOption = {
  groupId: string;
  group: LocalizedText;
  kind: "single" | "multiple" | "text" | "quantity";
  choiceId?: string;
  choice?: LocalizedText;
  priceDeltaRs: number;
  quantity?: number;
  text?: string;
};

export type WhatsappTemplateKey =
  | "approved"
  | "ready"
  | "on_the_way"
  | "payment_instructions"
  | "payment_reminder"
  | "blank";

export type WhatsappTemplates = Record<WhatsappTemplateKey, LocalizedText>;

export type HeroContent = { tagline: LocalizedText; imagePath: string | null };

/** Legacy shape of `settings.faq` (never written); the FAQ is one text per language (S-059). */
export type FaqEntry = { question: LocalizedText; answer: LocalizedText };
