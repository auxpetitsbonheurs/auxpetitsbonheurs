import { eq } from "drizzle-orm";
import { type LocalizedText, type TimeWindow, settings } from "~/db/schema";
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

export interface CheckoutSettings {
  deliveryFeeRs: number;
  windows: { delivery: TimeWindow[]; pickup: TimeWindow[] };
  pickup: { address: string | null; mapUrl: string | null };
  payment: { juiceNumber: string | null };
  policies: LocalizedText | null;
  orderNumberPrefix: string;
}

/** The Settings values checkout uses (fee, windows, pickup, payment, policies, number prefix). */
export async function getCheckoutSettings(db: Database): Promise<CheckoutSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("settings row 1 is missing (run the migrations)");
  return {
    deliveryFeeRs: row.deliveryFeeRs,
    windows: { delivery: row.deliveryWindows, pickup: row.pickupWindows },
    pickup: { address: present(row.pickupAddress), mapUrl: present(row.pickupMapUrl) },
    payment: { juiceNumber: present(row.juiceNumber) },
    policies: row.policies && row.policies.en.trim() !== "" ? row.policies : null,
    orderNumberPrefix: row.orderNumberPrefix,
  };
}
