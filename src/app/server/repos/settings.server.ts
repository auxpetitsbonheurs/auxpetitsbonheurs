import { eq } from "drizzle-orm";
import { settings } from "~/db/schema";
import type { Database } from "~/server/db.server";

export interface FooterContacts {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  pickupAddress: string | null;
}

const present = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);

/** Contact values shown in every page footer; blank Settings values are omitted (catalogue spec). */
export async function getFooterContacts(db: Database): Promise<FooterContacts> {
  const [row] = await db
    .select({
      whatsapp: settings.contactWhatsapp,
      phone: settings.contactPhone,
      email: settings.contactEmail,
      pickupAddress: settings.pickupAddress,
    })
    .from(settings)
    .where(eq(settings.id, 1));
  return {
    whatsapp: present(row?.whatsapp),
    phone: present(row?.phone),
    email: present(row?.email),
    pickupAddress: present(row?.pickupAddress),
  };
}
