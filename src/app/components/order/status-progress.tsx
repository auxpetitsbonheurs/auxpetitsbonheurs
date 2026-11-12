import { Check, Circle, CircleDot } from "lucide-react";
import type { OrderStatus } from "~/domain/status";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";
import { useStatusLabel } from "./status-badge";

/**
 * Design-system "Status progress": an ordered list with `aria-current="step"`, a text
 * summary ("Step 2 of 5: Approved") and a different icon shape per state, so the
 * position never depends on colour. Vertical on phones, a row from `md`.
 */
export function StatusProgress({ steps, current }: { steps: OrderStatus[]; current: number }) {
  const { t } = useI18n();
  const label = useStatusLabel();
  return (
    <section aria-labelledby="progress-heading" className="mt-8">
      <h2 id="progress-heading" className="section-title-start text-h2">
        {t("order.tracking.progressTitle")}
      </h2>
      <p className="mt-2 font-semibold">{t("order.tracking.stepOf", { current: current + 1, total: steps.length, label: label(steps[current]!) })}</p>
      <ol className="mt-4 grid gap-3 md:grid-cols-5 md:gap-2">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "next";
          const Icon = state === "done" ? Check : state === "current" ? CircleDot : Circle;
          return (
            <li
              key={step}
              aria-current={state === "current" ? "step" : undefined}
              className={cn("flex items-start gap-2 md:flex-col md:items-center md:text-center", state === "current" && "font-semibold")}
            >
              <Icon aria-hidden="true" className={cn("size-6 shrink-0", state === "next" ? "text-muted-foreground" : "text-success")} />
              <span>
                <span className="sr-only">{t(`order.tracking.step${state === "done" ? "Done" : state === "current" ? "Current" : "Next"}`)} </span>
                {label(step)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
