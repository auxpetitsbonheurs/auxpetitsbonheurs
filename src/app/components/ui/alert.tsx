import { CircleAlert, Info } from "lucide-react";
import { type ComponentProps, forwardRef } from "react";
import { cn } from "~/lib/utils";

type Tone = "info" | "danger";

const toneClass: Record<Tone, string> = {
  info: "border-info",
  danger: "border-destructive",
};

/**
 * Inline banner (design-system "Alert"): icon + title + text. Text stays in the
 * foreground colour on the page background (AA in both themes); the tone is carried
 * by the border colour and the icon, never by colour alone (the title says it).
 */
export const Alert = forwardRef<HTMLDivElement, ComponentProps<"div"> & { tone?: Tone; title?: string }>(
  function Alert({ tone = "info", title, className, children, ...props }, ref) {
    const Icon = tone === "danger" ? CircleAlert : Info;
    return (
      <div ref={ref} className={cn("flex gap-3 rounded-lg border-2 bg-background p-4", toneClass[tone], className)} {...props}>
        <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", tone === "danger" ? "text-destructive" : "text-info")} />
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children}
        </div>
      </div>
    );
  },
);
