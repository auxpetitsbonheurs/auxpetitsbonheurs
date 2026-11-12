import type { ReactNode } from "react";

export interface RadioCardProps {
  id: string;
  name: string;
  value: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
  defaultChecked?: boolean;
  onChoose?: (value: string) => void;
}

/**
 * Radio card row (design-system "Radio group", card rows). The native radio covers the
 * whole card (transparent, no appearance), so the tap target and the focus ring are the
 * card and arrow keys work natively; the dot is decorative.
 */
export function RadioCard({ id, name, value, title, hint, icon, defaultChecked, onChoose }: RadioCardProps) {
  return (
    <label
      htmlFor={id}
      className="relative flex min-h-12 min-w-0 cursor-pointer items-start gap-1 rounded-card border-2 border-input bg-card p-2 has-checked:border-primary has-checked:bg-accent min-[20rem]:gap-2 min-[20rem]:p-3 sm:gap-3 sm:p-4"
    >
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        onChange={() => onChoose?.(value)}
        className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-card"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-input bg-card peer-checked:border-[6px] peer-checked:border-primary"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 font-semibold wrap-anywhere">
          {icon}
          {title}
        </span>
        {hint && <span className="block text-sm">{hint}</span>}
      </span>
    </label>
  );
}
