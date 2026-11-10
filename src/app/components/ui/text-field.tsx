import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

const controlClass =
  "mt-2 block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive";

type InputAttributes = Omit<ComponentProps<"input">, "id" | "className">;

export interface TextFieldProps extends InputAttributes {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Visible "(optional)" suffix; required fields are not marked (design system). */
  optionalLabel?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

/** Field (design-system "Forms"): label → hint → control → error, tied with ids. */
export function TextField({ id, label, hint, error, optionalLabel, multiline, rows = 3, className, ...control }: TextFieldProps) {
  const describedBy = cn(hint && `${id}-hint`, error && `${id}-error`) || undefined;
  const shared = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, className: controlClass };
  return (
    <div className={className}>
      <label htmlFor={id} className="block font-semibold">
        {label} {optionalLabel && <span className="font-normal">{optionalLabel}</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea
          {...shared}
          name={control.name}
          rows={rows}
          autoComplete={control.autoComplete}
          defaultValue={control.defaultValue as string | undefined}
          maxLength={control.maxLength}
        />
      ) : (
        <input {...shared} {...control} />
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
          {error}
        </p>
      )}
    </div>
  );
}
