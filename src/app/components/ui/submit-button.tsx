import { LoaderCircle } from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";
import { Button } from "./button";

export interface SubmitButtonProps extends Omit<ComponentProps<typeof Button>, "type" | "disabled"> {
  pending: boolean;
  /** Announced in a polite status region while pending. */
  pendingText: string;
  /** Visible label while pending (e.g. "Adding…"); the normal label otherwise stays. */
  pendingLabel?: string;
}

/**
 * Submit with a loading state: a spinner is added (and `pendingLabel` replaces the label
 * when given), the button is `aria-disabled` + `aria-busy` (not `disabled`, so keyboard
 * focus stays on it), repeat presses are ignored, and `pendingText` is announced politely.
 */
export function SubmitButton({ pending, pendingText, pendingLabel, children, onClick, ...props }: SubmitButtonProps) {
  const guard = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) event.preventDefault();
    else onClick?.(event);
  };
  return (
    <>
      <Button type="submit" aria-disabled={pending || undefined} aria-busy={pending || undefined} onClick={guard} {...props}>
        {pending && <LoaderCircle aria-hidden="true" data-testid="pending-spinner" className="motion-safe:animate-spin" />}
        {pending && pendingLabel ? pendingLabel : children}
      </Button>
      <p role="status" className="sr-only">
        {pending ? pendingText : ""}
      </p>
    </>
  );
}
