import type { ReactNode } from "react";

export const inputClass = "mt-2 block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive";

/** Label → control → error, tied by ids (design-system "Forms"); the summary links to `id`. */
export function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
          {error}
        </p>
      )}
    </div>
  );
}

/** `aria-invalid` and `aria-describedby` for a field with an error. */
export function invalidProps(id: string, error?: string) {
  return error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

export function FormSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}
