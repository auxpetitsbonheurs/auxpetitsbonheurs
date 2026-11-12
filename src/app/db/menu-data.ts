// The Owner's real menu (S-241), copied from docs/content/menu-source/README.md (2026-11-11).
// Used by `npm run seed:menu` on staging only. Dependency-free, like sample-data.ts.
// Names drop the source's emoji (screen readers, slugs); French stays empty until the
// copywriter's text is approved by the Owner (English shows meanwhile). A product whose price
// is still "Rs [price]" in the source has `pricePlaceholder: true`: it is seeded at Rs 0 with
// Rs 0 size deltas and hidden, so it can never be ordered. When the Owner sends prices,
// update the source README and this file, or (preferred) type them in the editor on staging.

export interface MenuSeedChoice {
  nameEn: string;
  nameFr: string;
  priceDeltaRs: number;
}

export interface MenuSeedProduct {
  nameEn: string;
  /** null when the source has none yet (shown as missing content in the run report). */
  descriptionEn: string | null;
  type: "cake" | "dessert";
  basePriceRs: number;
  pricePlaceholder: boolean;
  /** File name in docs/content/menu-source/photos/, or null when the Owner has not sent one. */
  photo: string | null;
  /** One required single-choice group (Box for cookies, Size for cakes). */
  options: { nameEn: string; nameFr: string; choices: MenuSeedChoice[] };
}

/** Where the source photos live, relative to the repository root. */
export const MENU_PHOTOS_DIR = "docs/content/menu-source/photos";

/** Cookies: Box of 6 / 12 / 18 at Rs 420 / 780 / 1080 (deltas from the Rs 420 base). */
const COOKIE_BOXES: MenuSeedProduct["options"] = {
  nameEn: "Box",
  nameFr: "Boîte",
  choices: [
    { nameEn: "Box of 6", nameFr: "Boîte de 6", priceDeltaRs: 0 },
    { nameEn: "Box of 12", nameFr: "Boîte de 12", priceDeltaRs: 360 },
    { nameEn: "Box of 18", nameFr: "Boîte de 18", priceDeltaRs: 660 },
  ],
};

/** Cake sizes; the base price is the 6 inch, the others add the difference (placeholders: 0). */
const CAKE_SIZES: MenuSeedProduct["options"] = {
  nameEn: "Size",
  nameFr: "Taille",
  choices: [
    { nameEn: "6 inch (5–10 people)", nameFr: "6 pouces (5 à 10 personnes)", priceDeltaRs: 0 },
    { nameEn: "7 inch (10–15 people)", nameFr: "7 pouces (10 à 15 personnes)", priceDeltaRs: 0 },
    { nameEn: "8 inch (15–20 people)", nameFr: "8 pouces (15 à 20 personnes)", priceDeltaRs: 0 },
  ],
};

const cake = (nameEn: string, descriptionEn: string | null, photo: string | null): MenuSeedProduct => ({
  nameEn,
  descriptionEn,
  type: "cake",
  basePriceRs: 0,
  pricePlaceholder: true,
  photo,
  options: CAKE_SIZES,
});

/** In menu-source order: the seed keeps it as the order within each type. */
export const MENU_PRODUCTS: readonly MenuSeedProduct[] = [
  {
    nameEn: "Chocolate chip cookies",
    descriptionEn: "Freshly baked soft cookies",
    type: "dessert",
    basePriceRs: 420,
    pricePlaceholder: false,
    photo: "chocolate-chip-cookies.jpg",
    options: COOKIE_BOXES,
  },
  cake("Signature Red Velvet Cake", "Soft red velvet cake with cream cheese and raspberry coulis", "red-velvet-cake.jpg"),
  cake("Black Forest Cake", "Soft chocolate génoise with cherries and cream", "black-forest-cake.jpg"),
  cake("Génoise aux pêches", "Light and airy génoise layered with whipped cream and peaches", "genoise-aux-peches.jpg"),
  cake("Chocolate Cake", "Moist chocolate sponge with Lindt chocolate ganache and SMBC frosting", "chocolate-cake.jpg"),
  cake("Vanilla Cake", null, null),
  cake("Pistachio Cake", null, null),
];
