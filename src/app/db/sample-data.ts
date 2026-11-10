// Sample catalogue data (S-011): "Chocolate cake" at Rs 850 with one photo. Used by
// `npm run seed:sample` (never in production) and by the e2e baseline. The price is
// sample data, not a launch price. Dependency-free so Playwright can import it.

export const SAMPLE_PRODUCT = {
  slug: "chocolate-cake",
  type: "cake",
  nameEn: "Chocolate cake",
  nameFr: "Gâteau au chocolat",
  descriptionEn: "A rich chocolate sponge with ganache.",
  descriptionFr: "Une génoise au chocolat et sa ganache.",
  basePriceRs: 850,
} as const;

/** A bundled static image (path starting with "/"), so the sample needs no Storage upload. */
export const SAMPLE_PHOTO = {
  storagePath: "/images/sample/chocolate-cake.svg",
  width: 800,
  height: 600,
  sortOrder: 0,
} as const;
