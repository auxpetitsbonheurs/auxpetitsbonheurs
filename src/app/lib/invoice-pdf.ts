// The invoice PDF (S-127), built in the browser: the Worker's 10 ms CPU cannot render it. Loaded
// only when an admin asks for an invoice (its own chunk, outside every route's initial JS). A4
// portrait after the client's paper template: the business top left, the cream badge top right, a
// grey-blue band with the number and date, three labelled columns, the items table, the totals
// box and the payment details. PDF standard fonts (Times for the template's serif, Helvetica for
// its small caps labels): nothing to download, and every Latin-1 letter of EN and FR prints.
import { type PDFFont, type PDFImage, type PDFPage, PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { InvoiceDocument, InvoiceLine } from "~/domain/invoice";
import { formatInvoiceDate } from "~/domain/invoice";
import { formatRupeeAmount, formatRupees } from "~/lib/locale";

const PAGE = { width: 595.28, height: 841.89 } as const;
const LEFT = 53;
const RIGHT = PAGE.width - 50;
const BAND = rgb(0xa4 / 255, 0xb0 / 255, 0xb5 / 255);
const LABEL = rgb(0x4f / 255, 0x6b / 255, 0x7c / 255);
const INK = rgb(0x3b / 255, 0x3b / 255, 0x3b / 255);
const RULE = rgb(0xc9 / 255, 0xd1 / 255, 0xd5 / 255);
const RULE_DARK = rgb(0x8a / 255, 0x9b / 255, 0xa3 / 255);
const STAMP = rgb(0x2e / 255, 0x7d / 255, 0x5b / 255);
const WHITE = rgb(1, 1, 1);
const BODY = 9.5;
const SMALL = 7.5;
const ROW = 20;
const MIN_ROWS = 5;
/** Columns of the three labelled fields and the items table. */
const COL = { billTo: LEFT + 5, eventDate: LEFT + 129, instructions: LEFT + 252, description: LEFT + 99, unitRight: RIGHT - 102, totalRight: RIGHT - 6 } as const;
const TOTALS_LEFT = LEFT + 246;
/** Room kept under the table for the totals box and payment details before a new page starts. */
const FOOTER_SPACE = 250;

interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
}

/** Standard fonts print WinAnsi only: accents are kept, anything else loses its marks or becomes "?". */
function printable(font: PDFFont): (text: string) => string {
  const known = new Set(font.getCharacterSet());
  return (text) =>
    [...text.replace(/[\r\n\t]+/g, " ")]
      .map((char) => {
        if (known.has(char.codePointAt(0) ?? 0)) return char;
        const bare = char.normalize("NFD").replace(/\p{M}/gu, "");
        return bare !== "" && [...bare].every((c) => known.has(c.codePointAt(0) ?? 0)) ? bare : "?";
      })
      .join("");
}

/** Words onto lines no wider than `width`; a single long word is cut. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A page with a cursor `y` (distance from the top) and helpers in top-down coordinates. */
class Sheet {
  y = 0;
  constructor(
    public page: PDFPage,
    private fonts: Fonts,
    public readonly clean: (text: string) => string,
  ) {}

  text(text: string, x: number, top: number, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) {
    const font = options.font ?? this.fonts.serif;
    const size = options.size ?? BODY;
    const value = this.clean(text);
    const left = options.align === "right" ? x - font.widthOfTextAtSize(value, size) : x;
    this.page.drawText(value, { x: left, y: PAGE.height - top, size, font, color: options.color ?? INK });
    return font.widthOfTextAtSize(value, size);
  }

  rect(x: number, top: number, width: number, height: number, color: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x, y: PAGE.height - top - height, width, height, color });
  }

  rule(x1: number, x2: number, top: number, color = RULE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: PAGE.height - top }, end: { x: x2, y: PAGE.height - top }, thickness, color });
  }
}

/** The Owner's cream badge (300 px PNG, transparent corners), `size` points wide. */
function drawBadge(sheet: Sheet, badge: PDFImage, centerX: number, centerTop: number, size: number) {
  sheet.page.drawImage(badge, { x: centerX - size / 2, y: PAGE.height - centerTop - size / 2, width: size, height: size });
}

function drawHeader(sheet: Sheet, doc: InvoiceDocument, fonts: Fonts, badge: PDFImage | null) {
  const { business, labels } = doc;
  const lines = [business.legalName?.toUpperCase(), business.brn && `${labels.brn} ${business.brn}`, ...business.address, business.phone && `${labels.phone} ${business.phone}`];
  let top = 52;
  for (const line of lines) {
    if (!line) continue;
    sheet.text(line, LEFT, top);
    top += 12.6;
  }
  if (badge) drawBadge(sheet, badge, RIGHT - 58, 104, 114);
  sheet.rect(LEFT, 174, RIGHT - LEFT, 29, BAND);
  sheet.text(`${labels.invoiceNo} ${doc.number}`, LEFT + 5, 193, { font: fonts.sans, size: 12, color: WHITE });
  sheet.text(`${labels.date} ${formatInvoiceDate(doc.date)}`, RIGHT - 6, 193, { font: fonts.sans, size: 12, color: WHITE, align: "right" });
}

function drawFields(sheet: Sheet, doc: InvoiceDocument, fonts: Fonts) {
  const { labels } = doc;
  for (const [label, x] of [[labels.billTo, COL.billTo], [labels.eventDate, COL.eventDate], [labels.instructions, COL.instructions]] as const) {
    sheet.text(label, x, 228, { font: fonts.sans, size: SMALL, color: LABEL });
  }
  sheet.rule(LEFT, RIGHT, 233, RULE_DARK);
  const billTo = wrap(sheet.clean(doc.billTo), fonts.serif, BODY, COL.eventDate - COL.billTo - 8);
  billTo.forEach((line, i) => sheet.text(line, COL.billTo, 245 + i * 12));
  // "5th November 2026": the ordinal set small and raised, as on the template.
  const { day, suffix, rest } = doc.eventDate;
  let x = COL.eventDate + sheet.text(day, COL.eventDate, 245);
  if (suffix) x += sheet.text(suffix, x, 241.5, { size: BODY * 0.6 });
  sheet.text(` ${rest}`, x, 245);
  const instructions = doc.instructions.flatMap((line) => wrap(sheet.clean(line), fonts.serif, BODY, RIGHT - COL.instructions - 6));
  instructions.forEach((line, i) => sheet.text(line, COL.instructions, 245 + i * 12));
  sheet.y = 245 + Math.max(billTo.length, instructions.length, 1) * 12 + 8;
}

function drawTableHead(sheet: Sheet, doc: InvoiceDocument, fonts: Fonts) {
  const { labels } = doc;
  sheet.rect(LEFT, sheet.y, RIGHT - LEFT, 19, BAND);
  const base = sheet.y + 12.5;
  const head = { font: fonts.sans, size: SMALL, color: WHITE };
  sheet.text(labels.quantity, LEFT + 5, base, head);
  sheet.text(labels.description, COL.description, base, head);
  sheet.text(labels.unitPrice, COL.unitRight, base, { ...head, align: "right" });
  sheet.text(labels.total, COL.totalRight, base, { ...head, align: "right" });
  sheet.y += 19;
}

/** One table row (description wrapped, then its detail lines smaller); returns its height. */
function rowLines(sheet: Sheet, line: InvoiceLine, fonts: Fonts) {
  const width = COL.unitRight - COL.description - 60;
  const title = wrap(sheet.clean(line.description), fonts.serif, BODY, width);
  const details = line.details.flatMap((detail) => wrap(sheet.clean(detail), fonts.serif, BODY - 1.5, width));
  return { title, details, height: Math.max(ROW, 8 + title.length * 12 + details.length * 10.5) };
}

function drawRow(sheet: Sheet, line: InvoiceLine, fonts: Fonts) {
  const { title, details, height } = rowLines(sheet, line, fonts);
  const top = sheet.y + 13.5;
  if (line.quantity !== null) sheet.text(String(line.quantity), LEFT + 5, top);
  title.forEach((text, i) => sheet.text(text, COL.description, top + i * 12));
  details.forEach((text, i) => sheet.text(text, COL.description, top + title.length * 12 + i * 10.5 - 1.5, { size: BODY - 1.5, color: LABEL }));
  sheet.text(formatRupeeAmount(line.unitRs), COL.unitRight, top, { align: "right" });
  sheet.text(formatRupeeAmount(line.totalRs), COL.totalRight, top, { align: "right" });
  sheet.y += height;
  sheet.rule(LEFT, RIGHT, sheet.y);
}

async function drawTable(pdf: PDFDocument, first: Sheet, doc: InvoiceDocument, fonts: Fonts, clean: (text: string) => string): Promise<Sheet> {
  let sheet = first;
  drawTableHead(sheet, doc, fonts);
  for (const line of doc.lines) {
    if (sheet.y + rowLines(sheet, line, fonts).height > PAGE.height - 60) {
      sheet = new Sheet(pdf.addPage([PAGE.width, PAGE.height]), fonts, clean);
      sheet.y = 50;
      drawTableHead(sheet, doc, fonts);
    }
    drawRow(sheet, line, fonts);
  }
  // A few empty ruled rows when the table is short, as on the template.
  for (let i = doc.lines.length; i < MIN_ROWS && sheet.y + ROW < PAGE.height - FOOTER_SPACE; i += 1) {
    sheet.y += ROW;
    sheet.rule(LEFT, RIGHT, sheet.y);
  }
  sheet.rule(LEFT, RIGHT, sheet.y, RULE_DARK);
  return sheet;
}

function totalsRows(doc: InvoiceDocument): { label: string; value: string; bold?: boolean }[] {
  const { totals, labels } = doc;
  return [
    { label: labels.subtotal, value: formatRupees(totals.subtotalRs) },
    ...(totals.discountRs > 0 ? [{ label: (doc.discountLabel ?? "").toUpperCase(), value: `– ${formatRupees(totals.discountRs)}` }] : []),
    ...(totals.adjustmentRs !== 0 ? [{ label: labels.adjustment, value: `${totals.adjustmentRs < 0 ? "– " : ""}${formatRupees(Math.abs(totals.adjustmentRs))}` }] : []),
    { label: labels.downpayment, value: totals.paidRs > 0 ? `${labels.paid} ${formatRupees(totals.paidRs)}` : "" },
    { label: labels.totalDue, value: formatRupees(totals.dueRs), bold: true },
  ];
}

function drawTotals(sheet: Sheet, doc: InvoiceDocument, fonts: Fonts) {
  const start = sheet.y;
  for (const row of totalsRows(doc)) {
    const base = sheet.y + 13.5;
    const labelLines = wrap(sheet.clean(row.label), row.bold ? fonts.sansBold : fonts.sans, SMALL, 120);
    labelLines.forEach((text, i) => sheet.text(text, TOTALS_LEFT + 6, base + i * 9, { font: row.bold ? fonts.sansBold : fonts.sans, size: SMALL, color: LABEL }));
    sheet.text(row.value, COL.totalRight, base, { font: row.bold ? fonts.serifBold : fonts.serif, color: LABEL, align: "right" });
    sheet.y += Math.max(ROW, 8 + labelLines.length * 9);
    sheet.rule(TOTALS_LEFT, RIGHT, sheet.y, row.bold ? RULE_DARK : RULE);
  }
  if (doc.totals.dueRs === 0 && doc.totals.totalRs > 0) drawPaidStamp(sheet, doc.labels.paidStamp, fonts, start);
}

/** "PAID" stamped beside the totals when nothing is left to pay, tilted like a rubber stamp. */
function drawPaidStamp(sheet: Sheet, label: string, fonts: Fonts, top: number) {
  const size = 22;
  const angle = 8;
  const text = sheet.clean(label);
  const width = fonts.sansBold.widthOfTextAtSize(text, size) + 20;
  const x = TOTALS_LEFT - width - 40;
  const y = PAGE.height - top - 62;
  const rad = (angle * Math.PI) / 180;
  // The text's origin, 10 pt in and 10 pt up inside the box, turned with it about the box's corner.
  const at = { x: x + 10 * Math.cos(rad) - 10 * Math.sin(rad), y: y + 10 * Math.sin(rad) + 10 * Math.cos(rad) };
  sheet.page.drawRectangle({ x, y, width, height: 34, borderColor: STAMP, borderWidth: 2, rotate: degrees(angle) });
  sheet.page.drawText(text, { ...at, size, font: fonts.sansBold, color: STAMP, rotate: degrees(angle) });
}

function drawFooter(pdf: PDFDocument, sheet: Sheet, doc: InvoiceDocument, fonts: Fonts, clean: (text: string) => string) {
  const { labels, payment } = doc;
  const details = [
    payment.bankName && `${labels.bank} ${payment.bankName}`,
    payment.accountName && `${labels.accountName} ${payment.accountName}`,
    payment.accountNumber && `${labels.accountNumber} ${payment.accountNumber}`,
    payment.juiceNumber && `${labels.juice} ${payment.juiceNumber}`,
  ].filter((line): line is string => Boolean(line));
  const blocks = [
    ...(details.length > 0 ? [{ title: labels.paymentDetails, lines: details }] : []),
    ...(doc.terms.length > 0 ? [{ title: labels.paymentTerms, lines: doc.terms }] : []),
  ];
  const wrapped = blocks.map((block) => ({ title: block.title, lines: block.lines.flatMap((line) => wrap(clean(line), fonts.serif, BODY, RIGHT - LEFT)) }));
  const thanks = doc.thankYou ? wrap(clean(doc.thankYou), fonts.serif, BODY, RIGHT - LEFT) : [];
  const height = wrapped.reduce((sum, block) => sum + 26 + block.lines.length * 12, 0) + (thanks.length > 0 ? 24 + thanks.length * 12 : 0);
  let page = sheet;
  // Where the template has it (about two thirds down), or just under the totals when they run lower.
  let top = Math.max(sheet.y + 50, 548);
  if (top + height > PAGE.height - 40) top = sheet.y + 36;
  if (top + height > PAGE.height - 40) {
    page = new Sheet(pdf.addPage([PAGE.width, PAGE.height]), fonts, clean);
    top = 60;
  }
  for (const block of wrapped) {
    page.text(block.title, LEFT, top, { font: fonts.serifBold });
    block.lines.forEach((line, i) => page.text(line, LEFT, top + 13 + i * 12));
    top += 26 + block.lines.length * 12;
  }
  if (thanks.length > 0) thanks.forEach((line, i) => page.text(line, LEFT, top + 24 + i * 12));
}

/**
 * The invoice as PDF bytes. Deterministic for a given document (fixed dates in the metadata).
 * `badgePng` is the Owner's badge (lib/brand INVOICE_BADGE_PATH); without it (it failed to load)
 * the invoice is complete without the badge rather than not at all.
 */
export async function buildInvoicePdf(doc: InvoiceDocument, badgePng?: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const badge = badgePng ? await pdf.embedPng(badgePng) : null;
  const fonts: Fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const clean = printable(fonts.serif);
  const issued = new Date(`${doc.date}T00:00:00+04:00`);
  pdf.setTitle(`${doc.labels.invoiceNo} ${doc.number}`);
  pdf.setLanguage(doc.locale === "fr" ? "fr-MU" : "en-MU");
  pdf.setCreator("Aux petits bonheurs");
  pdf.setProducer("Aux petits bonheurs");
  pdf.setCreationDate(issued);
  pdf.setModificationDate(issued);
  const first = new Sheet(pdf.addPage([PAGE.width, PAGE.height]), fonts, clean);
  drawHeader(first, doc, fonts, badge);
  drawFields(first, doc, fonts);
  const last = await drawTable(pdf, first, doc, fonts, clean);
  drawTotals(last, doc, fonts);
  drawFooter(pdf, last, doc, fonts, clean);
  return pdf.save({ useObjectStreams: false });
}
