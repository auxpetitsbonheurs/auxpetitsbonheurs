// The workshop event editor's fields (E-15 S-301 AC2): texts EN/FR, photo, when and where, price
// and places, cake options (1..10, each EN with optional FR). Every problem is listed at once by
// the error summary with its field named; the save bar stays visible above the bottom bar.
import { Plus, Trash2 } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import type { ImageState } from "~/components/admin/site-image-field";
import { Button } from "~/components/ui/button";
import { TextField } from "~/components/ui/text-field";
import { WORKSHOP_LIMITS as L } from "~/domain/workshop";
import { useI18n } from "~/i18n/react";

export interface EditorValues {
  id: string | null;
  version: number | null;
  titleEn: string;
  titleFr: string;
  descriptionEn: string;
  descriptionFr: string;
  photoPath: string | null;
  photoUrl: string | null;
  eventOn: string;
  startsAt: string;
  endsAt: string;
  address: string;
  mapUrl: string;
  priceRs: string;
  capacity: string;
  options: { id: string; en: string; fr: string }[];
}

type Fields = Record<string, string>;

const EventPhoto = lazy(() => import("./event-photo"));

/** Field name -> element id, for the error summary. */
export const EDITOR_ANCHORS: Record<string, string> = {
  titleEn: "ws-title-en",
  titleFr: "ws-title-fr",
  descriptionEn: "ws-description-en",
  descriptionFr: "ws-description-fr",
  photoPath: "workshop-photo",
  eventOn: "ws-date",
  startsAt: "ws-starts",
  endsAt: "ws-ends",
  address: "ws-address",
  mapUrl: "ws-map",
  priceRs: "ws-price",
  capacity: "ws-capacity",
  options: "ws-option-0-en",
};

function Legend({ text }: { text: string }) {
  return <legend className="mb-2 text-xl font-semibold">{text}</legend>;
}

const grid = "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2";

function OptionsSection({ values, error }: { values: EditorValues; error?: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(values.options.length > 0 ? values.options : [{ id: "", en: "", fr: "" }]);
  return (
    <fieldset className="min-w-0" aria-describedby={error ? "ws-options-error" : "ws-options-hint"}>
      <Legend text={t("admin.workshops.optionsSection")} />
      <p id="ws-options-hint" className="text-sm text-muted-foreground">
        {t("admin.workshops.optionsHint")}
      </p>
      {error && (
        <p id="ws-options-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
      <ul className="mt-2 grid gap-3">
        {rows.map((row, i) => (
          <li key={`${row.id}-${i}`} className="grid gap-2 rounded-card border border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <input type="hidden" name={`option.${i}.id`} value={row.id} />
            <TextField id={`ws-option-${i}-en`} name={`option.${i}.en`} label={t("admin.workshops.optionEn", { n: i + 1 })} defaultValue={row.en} maxLength={L.optionNameMax} autoComplete="off" />
            <TextField id={`ws-option-${i}-fr`} name={`option.${i}.fr`} label={t("admin.workshops.optionFr", { n: i + 1 })} optionalLabel={t("admin.promotions.optional")} defaultValue={row.fr} maxLength={L.optionNameMax} autoComplete="off" />
            {rows.length > 1 && (
              <Button type="button" variant="outline" size="lg" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t("admin.workshops.removeOption", { n: i + 1 })}>
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {rows.length < L.optionsMax && (
        <Button type="button" variant="outline" className="mt-3" onClick={() => setRows([...rows, { id: "", en: "", fr: "" }])}>
          <Plus aria-hidden="true" />
          {t("admin.workshops.addOption")}
        </Button>
      )}
    </fieldset>
  );
}

export function EventEditorFields({ values, errors, onPhoto }: { values: EditorValues; errors: Fields; onPhoto: (state: ImageState) => void }) {
  const { t } = useI18n();
  const optional = t("admin.promotions.optional");
  return (
    <>
      <fieldset className={grid}>
        <Legend text={t("admin.workshops.textSection")} />
        <TextField id="ws-title-en" name="titleEn" label={t("admin.workshops.titleEn")} defaultValue={values.titleEn} maxLength={L.titleMax} error={errors.titleEn} autoComplete="off" />
        <TextField id="ws-title-fr" name="titleFr" label={t("admin.workshops.titleFr")} optionalLabel={optional} defaultValue={values.titleFr} maxLength={L.titleMax} error={errors.titleFr} autoComplete="off" />
        <TextField id="ws-description-en" name="descriptionEn" label={t("admin.workshops.descriptionEn")} optionalLabel={optional} defaultValue={values.descriptionEn} maxLength={L.descriptionMax} error={errors.descriptionEn} multiline rows={4} />
        <TextField id="ws-description-fr" name="descriptionFr" label={t("admin.workshops.descriptionFr")} optionalLabel={optional} defaultValue={values.descriptionFr} maxLength={L.descriptionMax} error={errors.descriptionFr} multiline rows={4} />
      </fieldset>
      <fieldset className="min-w-0">
        <Legend text={t("admin.workshops.photoSection")} />
        <Suspense
          fallback={
            <div>
              <p className="font-semibold">{t("admin.workshops.photo")}</p>
              <input type="hidden" name="photoPath" value={values.photoPath ?? ""} />
              <span aria-hidden="true" className="mt-2 block size-24 rounded-md border border-border bg-decorative" />
            </div>
          }
        >
          <EventPhoto path={values.photoPath} url={values.photoUrl} error={errors.photoPath} onState={onPhoto} />
        </Suspense>
      </fieldset>
      <fieldset className={grid}>
        <Legend text={t("admin.workshops.whenSection")} />
        <TextField id="ws-date" name="eventOn" type="date" label={t("admin.workshops.date")} defaultValue={values.eventOn} error={errors.eventOn} />
        <div className="grid grid-cols-2 gap-3">
          <TextField id="ws-starts" name="startsAt" type="time" label={t("admin.workshops.startsAt")} defaultValue={values.startsAt} error={errors.startsAt} />
          <TextField id="ws-ends" name="endsAt" type="time" label={t("admin.workshops.endsAt")} defaultValue={values.endsAt} error={errors.endsAt} />
        </div>
        <TextField id="ws-address" name="address" label={t("admin.workshops.address")} hint={t("admin.workshops.addressHint")} defaultValue={values.address} maxLength={L.addressMax} error={errors.address} multiline rows={2} />
        <TextField id="ws-map" name="mapUrl" type="url" inputMode="url" label={t("admin.workshops.mapUrl")} optionalLabel={optional} hint={t("admin.workshops.mapUrlHint")} defaultValue={values.mapUrl} maxLength={L.mapUrlMax} error={errors.mapUrl} autoComplete="off" />
      </fieldset>
      <fieldset className={grid}>
        <Legend text={t("admin.workshops.placesSection")} />
        <TextField id="ws-price" name="priceRs" type="number" inputMode="numeric" min={0} label={t("admin.workshops.price")} hint={t("admin.workshops.priceHint")} defaultValue={values.priceRs} error={errors.priceRs} />
        <TextField id="ws-capacity" name="capacity" type="number" inputMode="numeric" min={L.capacityMin} max={L.capacityMax} label={t("admin.workshops.capacity")} hint={t("admin.workshops.capacityHint")} defaultValue={values.capacity} error={errors.capacity} />
      </fieldset>
      <OptionsSection values={values} error={errors.options} />
    </>
  );
}
