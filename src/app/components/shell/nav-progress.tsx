import { useNavigation } from "react-router";
import { useI18n } from "~/i18n/react";

/**
 * Thin bar at the top of the page while a client navigation loads (language switch,
 * links, form redirects), so a slow network never looks like a dead tap. It appears
 * after 150 ms; under reduced motion it is a still bar.
 */
export function NavProgress() {
  const { t } = useI18n();
  const navigation = useNavigation();
  if (navigation.state === "idle") return null;
  return (
    <div role="progressbar" aria-label={t("shell.loading")} className="fixed inset-x-0 top-0 z-50 h-1">
      <div className="h-full origin-left animate-nav-progress bg-primary" />
    </div>
  );
}
