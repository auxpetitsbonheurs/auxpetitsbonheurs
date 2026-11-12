// The one way Owner-written text (About, FAQ, policies, privacy note; S-059 AC3, spec
// "Non-functional": rich text not supported) reaches a page: plain text, escaped by React,
// blank lines start a new paragraph and single line breaks are kept. No HTML is interpreted.
import { cn } from "~/lib/utils";

export function plainTextParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

export function PlainText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {plainTextParagraphs(text).map((paragraph, index) => (
        <p key={index} className="max-w-measure whitespace-pre-line wrap-anywhere">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
