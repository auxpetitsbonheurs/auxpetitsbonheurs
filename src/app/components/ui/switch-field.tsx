export interface SwitchFieldProps {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}

/**
 * Switch (design-system "Switch", admin only): a native checkbox with `role="switch"`, so it
 * works without JavaScript, posts `on` when on, and is announced as on/off. The whole row
 * (label + track) is the tap target; the label states the "on" meaning.
 */
export function SwitchField({ id, name, label, hint, defaultChecked }: SwitchFieldProps) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-3">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-2">
        <span className="block font-semibold">{label}</span>
        {hint && (
          <span id={`${id}-hint`} className="block text-sm text-muted-foreground wrap-anywhere">
            {hint}
          </span>
        )}
      </label>
      <span className="relative inline-flex min-h-11 min-w-14 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          role="switch"
          id={id}
          name={name}
          defaultChecked={defaultChecked}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none h-7 w-12 rounded-full border-2 border-input bg-muted transition-colors duration-150 motion-reduce:transition-none peer-checked:border-primary peer-checked:bg-primary"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute start-2.5 size-5 rounded-full bg-foreground transition-transform duration-150 motion-reduce:transition-none peer-checked:translate-x-5 peer-checked:bg-primary-foreground"
        />
      </span>
    </div>
  );
}
