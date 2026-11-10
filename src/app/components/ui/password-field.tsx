import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useHydrated } from "~/lib/use-hydrated";
import { cn } from "~/lib/utils";

export interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  labels: { show: string; hide: string; shown: string; hidden: string };
}

/**
 * Password input with a show/hide toggle (design-system "Forms"). The toggle is named
 * "Show password" / "Hide password" and the new state is announced politely. It only
 * renders once JavaScript runs, so there is never a button that does nothing.
 */
export function PasswordField({ id, name, label, autoComplete, error, labels }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const interactive = useHydrated();
  const [announcement, setAnnouncement] = useState("");
  const toggle = () => {
    setVisible(!visible);
    setAnnouncement(visible ? labels.hidden : labels.shown);
  };
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <div className="mt-2 flex items-stretch gap-2">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="block min-h-11 w-full min-w-0 rounded-md border-2 border-input bg-background px-3 py-2 text-base text-foreground aria-invalid:border-destructive"
        />
        {interactive && (
          <button
            type="button"
            onClick={toggle}
            aria-controls={id}
            className={cn("inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 border-input bg-background px-3 font-semibold hover:bg-muted")}
          >
            {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
            <span className="sr-only">{visible ? labels.hide : labels.show}</span>
          </button>
        )}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
          {error}
        </p>
      )}
    </div>
  );
}
