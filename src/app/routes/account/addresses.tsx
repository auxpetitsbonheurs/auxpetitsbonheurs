// `account/addresses` (`/account/addresses`, S-211; contracts.md): the signed-in customer's saved
// delivery addresses. Add and edit in a sheet (focus trapped, Escape closes, focus back to its
// trigger), delete with a confirm dialog. Customer only; every write is scoped to the session's row.
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { AccountFrame, RefusalAlert, isRefusal } from "~/components/account/account-ui";
import { buttonVariants } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";
import { actionError } from "~/server/action-result.server";
import { parseAddress } from "~/server/contracts/account";
import { Uuid } from "~/server/contracts/shared";
import { pageLocale, requireCustomer } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { type SavedAddress, addAddress, deleteAddress, listAddresses, updateAddress } from "~/server/repos/customer-addresses.server";
import { recordUsage } from "~/server/usage.server";
import type { Route } from "./+types/addresses";

export async function loader(args: Route.LoaderArgs) {
  const customer = await requireCustomer(args);
  return { title: translate("account.addresses.title", pageLocale(args)), addresses: await listAddresses(args.context.get(requestDbContext).db, customer.id) };
}

export async function action(args: Route.ActionArgs) {
  const customer = await requireCustomer(args);
  const locale = pageLocale(args);
  const db = args.context.get(requestDbContext).db;
  const form = Object.fromEntries(await args.request.formData());
  const intent = form.intent;
  const id = Uuid.safeParse(form.id);
  if (intent === "deleteAddress") {
    if (!id.success || !(await deleteAddress(db, customer.id, id.data))) return actionError("NOT_FOUND", locale, { extra: { intent } });
    return { ok: true as const, intent };
  }
  if (intent !== "addAddress" && intent !== "updateAddress") return actionError("VALIDATION_FAILED", locale);
  const parsed = parseAddress(form);
  const values = Object.fromEntries(["label", "address", "landmark", "isDefault"].map((key) => [key, typeof form[key] === "string" ? (form[key] as string) : ""]));
  if (!parsed.ok) {
    const fields = Object.fromEntries(Object.entries(parsed.problems).map(([field, key]) => [field, translate(key as string, locale)]));
    return actionError("VALIDATION_FAILED", locale, { fields, extra: { intent, values } });
  }
  if (intent === "addAddress") {
    await addAddress(db, customer.id, parsed.value);
    await recordUsage(args, "address_saved", { atCheckout: false });
    return { ok: true as const, intent };
  }
  if (!id.success || !(await updateAddress(db, customer.id, id.data, parsed.value))) return actionError("NOT_FOUND", locale, { extra: { intent } });
  return { ok: true as const, intent };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

const ANCHORS = { label: "address-label", address: "address-text", landmark: "address-landmark" };

function AddressForm({ address, onDone }: { address: SavedAddress | null; onDone: () => void }) {
  const { t } = useI18n();
  const fetcher = useFetcher<typeof action>();
  const refusal = isRefusal(fetcher.data) ? fetcher.data : undefined;
  const fields = refusal?.error.fields;
  const values = refusal?.values;
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !isRefusal(fetcher.data)) onDone();
  }, [fetcher.state, fetcher.data, onDone]);
  return (
    <fetcher.Form method="post" noValidate className="grid gap-5">
      <input type="hidden" name="intent" value={address ? "updateAddress" : "addAddress"} />
      {address && <input type="hidden" name="id" value={address.id} />}
      <RefusalAlert refusal={refusal} anchors={ANCHORS} />
      <TextField id="address-label" name="label" label={t("account.addresses.label")} hint={t("account.addresses.labelHint")} maxLength={40} autoComplete="off" defaultValue={values?.label ?? address?.label} error={fields?.label} />
      <TextField id="address-text" name="address" multiline rows={3} label={t("account.addresses.address")} autoComplete="street-address" maxLength={500} defaultValue={values?.address ?? address?.address} error={fields?.address} />
      <TextField
        id="address-landmark"
        name="landmark"
        label={t("account.addresses.landmark")}
        optionalLabel={t("account.common.optional")}
        maxLength={200}
        autoComplete="off"
        defaultValue={values?.landmark ?? address?.landmark ?? ""}
        error={fields?.landmark}
      />
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" name="isDefault" defaultChecked={address?.isDefault ?? false} className="size-6 accent-primary" />
        <span>{t("account.addresses.makeDefault")}</span>
      </label>
      <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("account.profile.saving")} size="lg" className="w-full">
        {t("account.addresses.save")}
      </SubmitButton>
    </fetcher.Form>
  );
}

function DeleteAddress({ address }: { address: SavedAddress }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof action>();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("account.addresses.deleteName", { label: address.label })} className={cn(buttonVariants({ variant: "outline" }), "text-destructive")}>
        {t("account.addresses.delete")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("account.addresses.deleteTitle")} closeLabel={t("account.addresses.cancel")} variant="dialog" returnFocusTo={() => "addresses-heading"}>
        <p>{t("account.addresses.deleteBody")}</p>
        <fetcher.Form method="post" className="mt-6 flex flex-wrap justify-end gap-3" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="deleteAddress" />
          <input type="hidden" name="id" value={address.id} />
          <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline" })}>
            {t("account.addresses.cancel")}
          </button>
          <SubmitButton variant="destructive" pending={fetcher.state !== "idle"} pendingText={t("account.addresses.delete")}>
            {t("account.addresses.delete")}
          </SubmitButton>
        </fetcher.Form>
      </Modal>
    </>
  );
}

export default function Addresses({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<SavedAddress | "new" | null>(null);
  const close = () => setEditing(null);
  return (
    <AccountFrame title={t("account.addresses.title")}>
      <h2 id="addresses-heading" tabIndex={-1} className="sr-only">
        {t("account.addresses.title")}
      </h2>
      {loaderData.addresses.length === 0 ? (
        <p className="rounded-card border border-border bg-card p-3 text-center min-[20rem]:p-6">{t("account.addresses.empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {loaderData.addresses.map((address) => (
            <li key={address.id} className="rounded-card border border-border bg-card p-4 wrap-anywhere">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-body text-lg font-semibold">{address.label}</h3>
                {address.isDefault && <span className="inline-flex min-h-6 items-center rounded-full border-2 border-primary px-3 py-0.5 text-sm font-semibold">{t("account.addresses.default")}</span>}
              </div>
              <p className="mt-1 whitespace-pre-line">{address.address}</p>
              {address.landmark && <p className="text-muted-foreground">{address.landmark}</p>}
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={() => setEditing(address)} aria-label={t("account.addresses.editName", { label: address.label })} className={buttonVariants({ variant: "outline" })}>
                  {t("account.addresses.edit")}
                </button>
                <DeleteAddress address={address} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" onClick={() => setEditing("new")} className={cn(buttonVariants({ size: "lg" }), "max-w-full px-4 min-[20rem]:px-7")}>
          {t("account.addresses.add")}
        </button>
      </div>
      <Modal open={editing !== null} onClose={close} title={editing === "new" ? t("account.addresses.addTitle") : t("account.addresses.editTitle")} closeLabel={t("account.addresses.cancel")}>
        {editing !== null && <AddressForm key={editing === "new" ? "new" : editing.id} address={editing === "new" ? null : editing} onDone={close} />}
      </Modal>
    </AccountFrame>
  );
}
