import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { type ComponentProps, forwardRef } from "react";
import { cn } from "~/lib/utils";

type Tone = "info" | "warning" | "danger" | "success";

const toneClass: Record<Tone, string> = {
  info: "border-info",
  warning: "border-warning",
  danger: "border-destructive",
  success: "border-success",
};

const toneIcon = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: CircleCheck } as const;
const iconClass: Record<Tone, string> = { info: "text-info", warning: "text-warning", danger: "text-destructive", success: "text-success" };

/**
 * Inline banner (design-system "Alert"): icon + title + text. Text stays in the
 * foreground colour on the page background (AA in both themes); the tone is carried
 * by the border colour and the icon, never by colour alone (the title says it).
 */
export const Alert = forwardRef<HTMLDivElement, ComponentProps<"div"> & { tone?: Tone; title?: string }>(
  function Alert({ tone = "info", title, className, children, ...props }, ref) {
    const Icon = toneIcon[tone];
    return (
      // Tighter below 20rem (200% zoom on a 320 px phone) so links inside stay 44 px wide.
      <div ref={ref} className={cn("flex gap-2 rounded-card border-2 bg-card p-2 min-[20rem]:gap-3 min-[20rem]:p-4", toneClass[tone], className)} {...props}>
        <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", iconClass[tone])} />
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children}
        </div>
      </div>
    );
  },
);
