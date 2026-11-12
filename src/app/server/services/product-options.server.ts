// A product's option groups on save (S-048 AC2-AC6, FR-062). The posted list replaces the
// stored one in order. Ids are kept when they already belong to this product (group) or to
// that group (choice), so baskets holding a choice id keep working after an edit; any other
// id is ignored and a new row is made. A few set-based statements, whatever the list size
// (every statement is a round trip from the Worker to the database).
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { optionChoice, optionGroup } from "~/db/schema";
import type { OptionGroupInput } from "~/domain/options";
import type { Database } from "~/server/db.server";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function storedIds(tx: Tx, productId: string) {
  const rows = await tx
    .select({ groupId: optionGroup.id, choiceId: optionChoice.id })
    .from(optionGroup)
    .leftJoin(optionChoice, eq(optionChoice.groupId, optionGroup.id))
    .where(eq(optionGroup.productId, productId));
  const groups = new Set(rows.map((r) => r.groupId));
  const choiceGroup = new Map(rows.filter((r) => r.choiceId).map((r) => [r.choiceId!, r.groupId]));
  return { groups, choiceGroup };
}

const excluded = (column: string) => sql.raw(`excluded."${column}"`);

export async function replaceOptionGroups(tx: Tx, productId: string, posted: readonly OptionGroupInput[]): Promise<void> {
  const stored = await storedIds(tx, productId);
  const groups = posted.map((group, sortOrder) => ({
    ...group,
    id: group.id && stored.groups.has(group.id) ? group.id : crypto.randomUUID(),
    sortOrder,
  }));
  const keepGroups = groups.map((g) => g.id);
  await tx.delete(optionGroup).where(and(eq(optionGroup.productId, productId), keepGroups.length > 0 ? notInArray(optionGroup.id, keepGroups) : undefined));
  if (groups.length === 0) return;
  await tx
    .insert(optionGroup)
    .values(
      groups.map((g) => ({
        id: g.id,
        productId,
        nameEn: g.name.en,
        nameFr: g.name.fr,
        kind: g.kind,
        required: g.required,
        textMaxLength: g.textMaxLength,
        quantityMin: g.quantityMin,
        quantityMax: g.quantityMax,
        sortOrder: g.sortOrder,
      })),
    )
    .onConflictDoUpdate({
      target: optionGroup.id,
      set: {
        nameEn: excluded("name_en"),
        nameFr: excluded("name_fr"),
        kind: excluded("kind"),
        required: excluded("required"),
        textMaxLength: excluded("text_max_length"),
        quantityMin: excluded("quantity_min"),
        quantityMax: excluded("quantity_max"),
        sortOrder: excluded("sort_order"),
      },
    });
  const choices = groups.flatMap((g) =>
    g.choices.map((choice, sortOrder) => ({
      id: choice.id && stored.choiceGroup.get(choice.id) === g.id ? choice.id : crypto.randomUUID(),
      groupId: g.id,
      nameEn: choice.name.en,
      nameFr: choice.name.fr,
      priceDeltaRs: choice.priceDeltaRs,
      sortOrder,
    })),
  );
  const keepChoices = choices.map((c) => c.id);
  await tx
    .delete(optionChoice)
    .where(and(inArray(optionChoice.groupId, keepGroups), keepChoices.length > 0 ? notInArray(optionChoice.id, keepChoices) : undefined));
  if (choices.length === 0) return;
  await tx
    .insert(optionChoice)
    .values(choices)
    .onConflictDoUpdate({
      target: optionChoice.id,
      set: { nameEn: excluded("name_en"), nameFr: excluded("name_fr"), priceDeltaRs: excluded("price_delta_rs"), sortOrder: excluded("sort_order") },
    });
}
