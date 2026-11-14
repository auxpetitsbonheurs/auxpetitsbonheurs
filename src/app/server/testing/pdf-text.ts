// Test helper (S-127): the text a PDF draws, read with pdf-lib. pdf-lib has no text extraction,
// so this decodes each page's content streams and collects the strings shown with Tj (hex or
// literal, WinAnsi), in drawing order, one per entry. Enough for the invoices this app builds.
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const WIN_ANSI_EXTRA: Record<number, string> = { 0x80: "€", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x96: "–", 0x97: "—" };
const winAnsi = (bytes: number[]) => bytes.map((b) => WIN_ANSI_EXTRA[b] ?? String.fromCharCode(b)).join("");

function streamsOf(contents: unknown, context: PDFDocument["context"]): PDFRawStream[] {
  if (contents instanceof PDFRawStream) return [contents];
  if (contents instanceof PDFArray) return contents.asArray().flatMap((ref) => streamsOf(context.lookup(ref), context));
  return [];
}

function shownStrings(operators: string): string[] {
  const out: string[] = [];
  for (const match of operators.matchAll(/<([0-9A-Fa-f]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    if (match[1] !== undefined) out.push(winAnsi((match[1].match(/../g) ?? []).map((pair) => parseInt(pair, 16))));
    else out.push((match[2] ?? "").replace(/\\(.)/g, "$1"));
  }
  return out;
}

/** Every string drawn on every page, plus the page count. */
export async function pdfText(bytes: Uint8Array): Promise<{ pages: number; strings: string[]; text: string }> {
  const pdf = await PDFDocument.load(bytes);
  const strings = pdf.getPages().flatMap((page) =>
    streamsOf(page.node.Contents(), pdf.context).flatMap((stream) => shownStrings(winAnsi([...decodePDFRawStream(stream).decode()]))),
  );
  return { pages: pdf.getPageCount(), strings, text: strings.join(" ") };
}
