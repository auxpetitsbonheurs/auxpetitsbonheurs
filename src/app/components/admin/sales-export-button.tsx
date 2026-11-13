import { Download, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "~/components/ui/button";
import { showToast } from "~/components/ui/toaster";
import { useI18n } from "~/i18n/react";

const CSV_PATH = "/admin/sales.csv";

/** The attachment name the server chose ("apb-sales-2026-11-01_2026-11-30.csv"). */
function fileName(response: Response): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
  return match?.[1] ?? "apb-sales.csv";
}

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * "Export CSV" (S-178 AC5, AC9): a GET form, so without JavaScript the browser downloads the
 * file directly; with it the button shows a busy state and a failure becomes the toast
 * "Export failed, try again" instead of an error page.
 */
export function SalesExportButton({ query }: { query: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(query);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${CSV_PATH}?${query}`, { headers: { Accept: "text/csv" } });
      if (!response.ok || !(response.headers.get("Content-Type") ?? "").startsWith("text/csv")) throw new Error(`export ${response.status}`);
      save(await response.blob(), fileName(response));
      showToast(t("admin.sales.exported"));
    } catch {
      showToast(t("admin.sales.exportFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="get" action={CSV_PATH} onSubmit={onSubmit}>
      {[...params].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant="outline" aria-busy={busy || undefined} aria-disabled={busy || undefined}>
        {busy ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <Download aria-hidden="true" />}
        <span aria-live="polite">{busy ? t("admin.sales.exporting") : t("admin.sales.export")}</span>
      </Button>
    </form>
  );
}
