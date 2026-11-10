/**
 * Keys used by the walking-skeleton screens (shell, home, errors, language switch).
 * i18n.test.ts checks each has non-empty text in en.json and fr.json (S-006 AC3).
 * Plural keys are listed without their _one/_other suffix.
 */
export const SKELETON_KEYS = [
  "shell.bakeryName",
  "shell.skipToContent",
  "shell.primaryNav",
  "shell.basketLink",
  "shell.basketStatus",
  "shell.footer.heading",
  "shell.footer.whatsapp",
  "shell.footer.phone",
  "shell.footer.email",
  "shell.footer.copyright",
  "language.other",
  "home.title",
  "home.intro",
  "home.metaDescription",
  "checkout.title",
  "errors.notFoundTitle",
  "errors.notFoundBody",
  "errors.genericTitle",
  "errors.genericBody",
  "errors.backHome",
] as const;
