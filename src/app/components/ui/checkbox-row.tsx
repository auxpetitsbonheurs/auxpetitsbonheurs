import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "~/lib/utils";

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "className" | "children">;

/**
 * A checkbox as one 44 px row (design-system "Forms", like the allergen chips): the real input
 * covers the whole row, so the row is the tap target and the focus ring; the box shows the
 * state with a check mark, never colour alone.
 */
export function CheckboxRow({ children, className, ...input }: CheckboxProps & { children: ReactNode; className?: string }) {
  return (
    <label className={cn("group relative flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 py-1 has-disabled:cursor-not-allowed has-disabled:opacity-70", className)}>
      <input type="checkbox" className="absolute inset-0 size-full cursor-pointer appearance-none rounded-md disabled:cursor-not-allowed" {...input} />
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-input bg-card group-has-checked:border-primary-strong group-has-checked:bg-accent">
        <Check className="hidden size-4 group-has-checked:block" />
      </span>
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </label>
  );
}
