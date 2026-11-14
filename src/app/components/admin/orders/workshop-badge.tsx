import { Palette } from "lucide-react";
import { useI18n } from "~/i18n/react";

/** "Workshop" on a registration's row in Orders and Today (E-15 S-305 AC3): word and icon, never colour alone. */
export function WorkshopBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-gold bg-card px-2 text-sm font-semibold">
      <Palette aria-hidden="true" className="size-4" />
      {t("admin.orders.sourceName.workshop")}
    </span>
  );
}
