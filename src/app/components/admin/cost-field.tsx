import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { parseCostRs } from "~/domain/cost";
import { useI18n } from "~/i18n/react";
import { formatRupeeAmount } from "~/lib/locale";

export type CostAnswer =
  | { ok: true; intent: "saveCost"; costRs: number | null }
  | { ok: false; intent?: string | null; error: { code: string; message: string; fields?: Record<string, string> } };

type CostStatus = "saving" | "saved" | "cleared" | "invalid" | "failed" | null;

/** What to say under the field, from the last thing typed and the fetcher. */
function costStatus(invalid: boolean, sent: boolean, fetcher: { state: string; data?: CostAnswer }): CostStatus {
  if (invalid) return "invalid";
  if (!sent) return null;
  if (fetcher.state !== "idle") return "saving";
  if (!fetcher.data) return null;
  if (fetcher.data.ok) return fetcher.data.costRs === null ? "cleared" : "saved";
  return fetcher.data.error.code === "VALIDATION_FAILED" ? "invalid" : "failed";
}

const shown = (costRs: number | null) => (costRs === null ? "" : formatRupeeAmount(costRs));

export interface CostFieldProps {
  /** Unique per page: the field id and the fetcher key. */
  id: string;
  label: string;
  hint: string;
  costRs: number | null;
  /** Shown under the field from the saved value ("Profit on this order: Rs 850"); null hides it. */
  extra?: (costRs: number | null) => string | null;
}

/**
 * "Cost to make" / "Cost to run" (S-318): one inline field that never blocks the page. Saved on
 * Save, Enter or leaving the field when the value changed (`saveCost`, no version, so it never
 * conflicts with a status change); "Saving…" then "Saved" is announced politely. A value that
 * is not whole rupees 0..1,000,000 is refused at once, before any request, and the text is kept.
 * Without JavaScript the Save button posts the same form.
 */
export function CostField({ id, label, hint, costRs, extra }: CostFieldProps) {
  const { t } = useI18n();
  const fetcher = useFetcher<CostAnswer>({ key: `cost-${id}` });
  const [text, setText] = useState(shown(costRs));
  const [invalid, setInvalid] = useState(false);
  const [sent, setSent] = useState(false);
  // What this field last sent (or loaded with): the same value again sends nothing.
  const lastSaved = useRef<number | null>(costRs);

  const save = () => {
    const parsed = parseCostRs(text);
    if (!parsed.ok) return setInvalid(true);
    setInvalid(false);
    setText(shown(parsed.costRs));
    if (parsed.costRs === lastSaved.current && !(fetcher.data && !fetcher.data.ok)) return;
    lastSaved.current = parsed.costRs;
    setSent(true);
    void fetcher.submit({ intent: "saveCost", costRs: parsed.costRs === null ? "" : String(parsed.costRs) }, { method: "post" });
  };

  const status = costStatus(invalid, sent, fetcher);
  const error = status === "invalid" ? t("admin.cost.invalid") : status === "failed" ? t("admin.cost.failed") : "";
  const live = status === "saving" ? t("admin.cost.saving") : status === "saved" ? t("admin.cost.saved") : status === "cleared" ? t("admin.cost.cleared") : "";
  const saved = fetcher.data?.ok ? fetcher.data.costRs : costRs;
  const note = extra?.(saved) ?? null;
  const describedBy = [`${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <fetcher.Form method="post" className="mt-3" onSubmit={(event) => (event.preventDefault(), save())} noValidate>
      <input type="hidden" name="intent" value="saveCost" />
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <div className="mt-2 flex flex-wrap items-stretch gap-2">
        <div className="flex min-w-0 flex-1 basis-40 items-stretch">
          <span aria-hidden="true" className="inline-flex items-center rounded-l-md border-2 border-r-0 border-input bg-muted px-3 font-semibold">
            Rs
          </span>
          <input
            id={id}
            name="costRs"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={12}
            value={text}
            onChange={(event) => (setText(event.target.value), invalid && setInvalid(false))}
            onBlur={save}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="block min-h-12 w-full min-w-0 rounded-r-md border-2 border-input bg-card px-3 py-2 text-base tabular-nums text-foreground aria-invalid:border-destructive"
          />
        </div>
        <Button type="submit" variant="outline" className="min-h-12">
          {t("admin.cost.save")}
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" data-testid={`${id}-status`} className="mt-1 min-h-6 text-sm font-semibold">
        {live}
      </p>
      {note && <p className="text-sm">{note}</p>}
    </fetcher.Form>
  );
}
