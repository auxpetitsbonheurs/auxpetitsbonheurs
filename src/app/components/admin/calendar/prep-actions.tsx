import { Printer, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { showToast } from "~/components/ui/toaster";
import { useI18n } from "~/i18n/react";
import type { PrepLoaderData } from "~/routes/admin/calendar-prep";

type Method = "share" | "copy" | "print";

/** Web Share when the browser has it, else the clipboard; null when both fail (S-140 AC1, AC2). */
async function shareOrCopy(text: string, title: string): Promise<Method | "cancelled" | null> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "share";
    } catch (error) {
      // The person closed the share sheet: nothing to report.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copy";
  } catch {
    return null;
  }
}

/**
 * Share and Print (S-140): labelled buttons (icon + word, 44 px). Share sends the server-built
 * `shareText` (no customer data); without Web Share it is copied ("Copied" in the polite
 * Toaster), and if copying fails the text is shown selected so it can be copied by hand. Print
 * opens the browser's print with the print stylesheet. Each use is logged without PII.
 */
export function PrepActions({ data }: { data: PrepLoaderData }) {
  const { t } = useI18n();
  const log = useFetcher({ key: "prep-log" });
  const [fallback, setFallback] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (fallback) textRef.current?.select();
  }, [fallback]);
  const record = (method: Method) => log.submit({ method }, { method: "post" });
  const share = async () => {
    const result = await shareOrCopy(data.shareText, data.title);
    if (result === "cancelled") return;
    if (result === null) {
      setFallback(true);
      showToast(t("admin.prep.copyFailed"), "error");
      return;
    }
    if (result === "copy") showToast(t("admin.prep.copied"));
    record(result);
  };
  return (
    <div className="grid gap-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={() => void share()}>
          <Share2 aria-hidden="true" />
          {t("admin.prep.share")}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => {
            record("print");
            window.print();
          }}
        >
          <Printer aria-hidden="true" />
          {t("admin.prep.print")}
        </Button>
      </div>
      {fallback && (
        <label className="grid gap-1">
          <span className="font-semibold">{t("admin.prep.shareTextLabel")}</span>
          <textarea ref={textRef} readOnly value={data.shareText} rows={10} className="w-full rounded-md border-2 border-input bg-card p-2 font-mono text-sm" />
        </label>
      )}
    </div>
  );
}
