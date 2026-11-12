import { LoaderCircle } from "lucide-react";
import { Link, useNavigation } from "react-router";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";

/**
 * Link to the same page in the other language (S-008, FR-001). A real link (works
 * without JavaScript); once hydrated it navigates client-side (no full reload, scroll
 * kept) and is aria-busy with a spinner while the other language loads. Its text is the
 * other language's own name, marked with that language for screen readers.
 */
export function LanguageSwitch({ href }: { href: string }) {
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const other: Locale = locale === "fr" ? "en" : "fr";
  const target = navigation.location;
  const pending = target !== undefined && `${target.pathname}${target.search}` === href;
  return (
    <Link
      to={href}
      preventScrollReset
      lang={other}
      hrefLang={other}
      aria-busy={pending || undefined}
      className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-md px-1.5 py-2 text-sm text-current underline underline-offset-4 hover:text-link-hover"
    >
      {t("language.other")}
      {pending && <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />}
    </Link>
  );
}
