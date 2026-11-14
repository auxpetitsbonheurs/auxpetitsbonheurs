import { useNavigation } from "react-router";
import { useI18n } from "~/i18n/react";
import { isPageChange } from "~/lib/delayed-flag";

/**
 * Thin bar at the top of the page while a client navigation loads (language switch,
 * links, form redirects), so a slow network never looks like a dead tap. It appears
 * after 150 ms; under reduced motion it is a still bar. Customer pages pass
 * `submissionsOnly`: their page changes show the whisk loader instead (S-284 AC7).
 */
export function NavProgress({ submissionsOnly = false }: { submissionsOnly?: boolean }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  if (navigation.state === "idle" || (submissionsOnly && isPageChange(navigation))) return null;
  return (
    <div role="progressbar" aria-label={t("shell.loading")} className="fixed inset-x-0 top-0 z-50 h-1">
      <div className="h-full origin-left animate-nav-progress bg-primary" />
    </div>
  );
}
