import { Download, LoaderCircle, Printer, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import type { InvoiceDocument } from "~/domain/invoice";
import { useI18n } from "~/i18n/react";
import { INVOICE_BADGE_PATH } from "~/lib/brand";

// Download invoice (S-127): the PDF is built here, in the browser (the Worker's 10 ms CPU cannot),
// from the admin-only `invoice.json`, with pdf-lib in its own lazily loaded chunk. The dialog says
// "Preparing invoice…" at once, starts the download as soon as the file exists, then offers Share
// (Web Share with the file, where the phone supports it) and Download again. A failure is a calm
// message with Try again and the printable page; the order page underneath never changes.

/**
 * The PDF code, browser only: `import.meta.env.SSR` is replaced at build time, so the Worker's
 * bundle never carries pdf-lib (it never runs these handlers).
 */
const loadInvoicePdf = () => (import.meta.env.SSR ? Promise.reject(new Error("browser only")) : import("~/lib/invoice-pdf"));

/** Starts loading the PDF code (More actions opened): the tap on Download then waits only for the data. */
export const preloadInvoicePdf = () => loadInvoicePdf().catch(() => undefined);

type State = { step: "preparing" } | { step: "ready"; file: File; url: string } | { step: "failed" };

/** The Owner's badge for the PDF (cached a day); a failure only leaves the badge out. */
async function loadBadge(signal: AbortSignal): Promise<Uint8Array | undefined> {
  try {
    const response = await fetch(INVOICE_BADGE_PATH, { signal });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

async function prepareInvoice(orderId: string, signal: AbortSignal): Promise<File> {
  const [response, pdf, badge] = await Promise.all([
    fetch(`/admin/orders/${orderId}/invoice.json`, { headers: { Accept: "application/json" }, signal }),
    loadInvoicePdf(),
    loadBadge(signal),
  ]);
  // A signed-out session is redirected to the sign-in page (HTML): not an invoice.
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("invoice_unavailable");
  const body = (await response.json()) as { ok: boolean; invoice?: InvoiceDocument };
  if (!body.ok || !body.invoice) throw new Error("invoice_unavailable");
  const bytes = await pdf.buildInvoicePdf(body.invoice, badge);
  return new File([bytes as Uint8Array<ArrayBuffer>], body.invoice.fileName, { type: "application/pdf" });
}

function saveFile(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const canShare = (file: File) => typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

/** Prepares once per mount: the dialog body mounts on open and again (new key) on Try again. */
function useInvoiceFile(orderId: string) {
  const [state, setState] = useState<State>({ step: "preparing" });
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    prepareInvoice(orderId, controller.signal).then(
      (file) => {
        const url = URL.createObjectURL(file);
        urlRef.current = url;
        setState({ step: "ready", file, url });
        saveFile(url, file.name);
      },
      () => {
        if (!controller.signal.aborted) setState({ step: "failed" });
      },
    );
    return () => {
      controller.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [orderId]);
  return state;
}

function Ready({ file, url }: { file: File; url: string }) {
  const { t } = useI18n();
  const [shareFailed, setShareFailed] = useState(false);
  const share = async () => {
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareFailed(true);
    }
  };
  return (
    <>
      <p role="status" className="font-semibold">
        {t("admin.invoice.ready", { file: file.name })}
      </p>
      <p className="mt-1 text-sm">{t("admin.invoice.readyHint")}</p>
      {shareFailed && (
        <p role="alert" className="mt-2 text-sm font-semibold">
          {t("admin.invoice.shareFailed")}
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {canShare(file) && (
          <Button type="button" size="lg" className="h-auto min-h-12 whitespace-normal" onClick={share}>
            <Share2 aria-hidden="true" />
            {t("admin.invoice.share")}
          </Button>
        )}
        <Button type="button" size="lg" variant="outline" className="h-auto min-h-12 whitespace-normal" onClick={() => saveFile(url, file.name)}>
          <Download aria-hidden="true" />
          {t("admin.invoice.downloadAgain")}
        </Button>
      </div>
    </>
  );
}

function PrintLink({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  return (
    <a href={`/admin/orders/${orderId}/invoice`} className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold link">
      <Printer aria-hidden="true" className="size-5" />
      {t("admin.invoice.printView")}
    </a>
  );
}

function InvoiceBody({ orderId, onRetry }: { orderId: string; onRetry: () => void }) {
  const { t } = useI18n();
  const state = useInvoiceFile(orderId);
  return (
    <div data-testid="invoice-dialog">
      {state.step === "preparing" && (
        <p role="status" className="flex min-h-12 items-center gap-2 font-semibold">
          <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />
          {t("admin.invoice.preparing")}
        </p>
      )}
      {state.step === "ready" && <Ready file={state.file} url={state.url} />}
      {state.step === "failed" && (
        <>
          <Alert tone="danger" role="alert">
            <p>{t("admin.invoice.failed")}</p>
          </Alert>
          <Button type="button" size="lg" className="mt-4 h-auto min-h-12 w-full whitespace-normal" onClick={onRetry}>
            {t("admin.invoice.tryAgain")}
          </Button>
        </>
      )}
      <PrintLink orderId={orderId} />
    </div>
  );
}

export function InvoiceDialog({ orderId, open, onClose }: { orderId: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  // The Modal renders its content only while open: the body mounts (and prepares) on each open.
  return (
    <Modal open={open} onClose={onClose} title={t("admin.invoice.title")} closeLabel={t("admin.states.close")} variant="dialog">
      <InvoiceBody key={attempt} orderId={orderId} onRetry={() => setAttempt((n) => n + 1)} />
    </Modal>
  );
}
