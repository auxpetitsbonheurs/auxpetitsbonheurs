import { Link } from "react-router";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";

/** "How we use your details: privacy note", placed near the submit button of every form that asks for personal details (S-225 AC4). */
export function PrivacyNoteLink({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  return (
    <p className={cn("text-sm", className)}>
      {t("privacyLink.text")}{" "}
      <Link to={localePath(locale, "/privacy")} className="inline-flex min-h-11 items-center link">
        {t("privacyLink.link")}
      </Link>
    </p>
  );
}
