import { useState } from "react";
import { graphemeLength } from "~/domain/pricing";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";

/** What happened to a change: taken, or refused because it would pass the limit. */
export type MessageInput = { value: string; refused: null } | { value: string; refused: "typed" | "pasted" };

/**
 * The limit rule of the message field (S-067 AC1, AC7): a change that would pass `max`
 * characters (grapheme clusters, trimmed, as the server counts) is refused whole, never cut;
 * a change adding more than one character at once (a paste, a dictation) is reported as
 * "pasted" so the field can say why nothing appeared.
 */
export function acceptMessageInput(previous: string, next: string, max: number): MessageInput {
  if (graphemeLength(next.trim()) <= max) return { value: next, refused: null };
  return { value: previous, refused: graphemeLength(next) - graphemeLength(previous) > 1 ? "pasted" : "typed" };
}

/**
 * Polite announcements only at thresholds (exactly 10 left, limit reached), never on every
 * keystroke: between them the region is empty, which screen readers do not announce.
 */
export function counterAnnouncement(count: number, max: number): "limit" | "few" | null {
  if (count >= max) return "limit";
  if (max > 10 && max - count === 10) return "few";
  return null;
}

export interface MessageFieldProps {
  id: string;
  name: string;
  label: string;
  hint: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
  /** A server or submit-time error ("Too long: up to 40 characters."). */
  error?: string;
  required?: boolean;
  requiredLabel?: string;
}

/**
 * Message on the cake (design-system "Message-on-cake field"): visible label, hint, a
 * counter tied with aria-describedby ("12 / 40", danger colour plus the words "Limit
 * reached" at the limit), over-limit input refused with a reason instead of silently
 * dropped (no native maxlength: it counts UTF-16 units and drops pasted text without notice).
 */
export function MessageField({ id, name, label, hint, max, value, onChange, error, required, requiredLabel }: MessageFieldProps) {
  const { t } = useI18n();
  const [refused, setRefused] = useState<"typed" | "pasted" | null>(null);
  const count = graphemeLength(value.trim());
  const atLimit = count >= max;
  const threshold = counterAnnouncement(count, max);
  const problem = refused === "pasted" ? t("productOptions.pasteTooLong", { max }) : error;
  const describedBy = cn(`${id}-hint`, `${id}-counter`, problem && `${id}-error`);
  return (
    <div className="mt-6">
      <label htmlFor={id} className="block font-semibold">
        {label} {required && requiredLabel && <span className="font-normal">({requiredLabel})</span>}
      </label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        autoComplete="off"
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const result = acceptMessageInput(value, event.target.value, max);
          setRefused(result.refused);
          if (result.refused === null) onChange(result.value);
        }}
        className="mt-2 block min-h-12 w-full scroll-mb-36 rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive md:scroll-mb-0"
      />
      <p id={`${id}-counter`} className={cn("mt-1 text-sm tabular-nums", atLimit ? "font-semibold text-destructive" : "text-muted-foreground")}>
        {t("productOptions.counter", { count, max })}
        {atLimit && <span> · {t("productOptions.limitReached", { max })}</span>}
      </p>
      <p className="sr-only" aria-live="polite">
        {threshold === "limit" ? t("productOptions.limitReached", { max }) : threshold === "few" ? t("productOptions.charactersLeft", { count: 10 }) : ""}
      </p>
      {problem && (
        <p id={`${id}-error`} role="alert" className="mt-1 font-semibold text-destructive wrap-anywhere">
          {problem}
        </p>
      )}
    </div>
  );
}
