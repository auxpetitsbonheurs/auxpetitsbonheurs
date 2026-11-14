// Settings > WhatsApp messages (S-202): the five templates, English and French, each with a live
// preview filled with a sample order in that language. An empty French text says the English one
// will be used (AC6). Errors come from the server per field (`whatsappTemplates.<key>.<locale>`),
// tied to the field by BilingualField (aria-describedby) and listed in the page's error summary.
import { type FormEvent, useState } from "react";
import type { LocalizedText, WhatsappTemplateKey, WhatsappTemplates } from "~/db/tables/json-types";
import { WHATSAPP_PLACEHOLDERS, WHATSAPP_TEMPLATE_KEYS, WHATSAPP_TEMPLATE_MAX, type WhatsappValues, fillTemplate } from "~/domain/whatsapp";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { BilingualField, SettingsSection } from "./settings-fields";

type Errors = Record<string, string | undefined>;

function Preview({ label, text, note }: { label: string; text: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted p-3">
      <p className="text-sm font-semibold">{label}</p>
      {note && <p className="text-sm">{note}</p>}
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere">{text}</p>
    </div>
  );
}

function TemplateField({ templateKey, value, sample, errors }: { templateKey: WhatsappTemplateKey; value: LocalizedText; sample: Record<Locale, WhatsappValues>; errors: Errors }) {
  const { t } = useI18n();
  const [text, setText] = useState({ en: value.en, fr: value.fr ?? "" });
  const name = `whatsappTemplates.${templateKey}`;
  const track = (event: FormEvent<HTMLDivElement>) => {
    const target = event.target as HTMLTextAreaElement;
    if (target.name === `${name}.en`) setText((current) => ({ ...current, en: target.value }));
    if (target.name === `${name}.fr`) setText((current) => ({ ...current, fr: target.value }));
  };
  const frEmpty = text.fr.trim() === "";
  return (
    <div onInput={track} className="grid gap-3">
      <BilingualField
        name={name}
        id={`whatsapp-${templateKey.replace(/_/g, "-")}`}
        label={t(`admin.order.whatsappTemplates.${templateKey}`)}
        max={WHATSAPP_TEMPLATE_MAX}
        value={value}
        multiline
        rows={3}
        errors={errors}
        frEmptyHint={t("admin.settings.whatsappFrEmpty")}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Preview label={t("admin.settings.previewEn")} text={fillTemplate(text.en, sample.en)} />
        <Preview label={t("admin.settings.previewFr")} note={frEmpty ? t("admin.settings.previewUsesEn") : undefined} text={fillTemplate(frEmpty ? text.en : text.fr, sample.fr)} />
      </div>
    </div>
  );
}

export function WhatsappTemplatesSection({ templates, sample, errors }: { templates: WhatsappTemplates; sample: Record<Locale, WhatsappValues>; errors: Errors }) {
  const { t } = useI18n();
  return (
    <SettingsSection id="whatsapp" title={t("admin.settings.whatsappTitle")} intro={t("admin.settings.whatsappIntro")}>
      <p className="max-w-measure text-sm">
        {t("admin.settings.whatsappPlaceholders")} <span className="wrap-anywhere font-mono">{WHATSAPP_PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}</span>
      </p>
      {WHATSAPP_TEMPLATE_KEYS.map((key) => (
        <TemplateField key={key} templateKey={key} value={templates[key]} sample={sample} errors={errors} />
      ))}
    </SettingsSection>
  );
}

/** Field name -> element id for the page's error summary links. */
export const WHATSAPP_ANCHORS: Record<string, string> = Object.fromEntries(
  WHATSAPP_TEMPLATE_KEYS.flatMap((key) => (["en", "fr"] as const).map((locale) => [`whatsappTemplates.${key}.${locale}`, `whatsapp-${key.replace(/_/g, "-")}-${locale}`])),
);
