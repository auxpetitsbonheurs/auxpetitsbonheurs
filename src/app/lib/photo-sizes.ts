// "sizes" of each place photos show (S-276), from its grid (the site frame is at most 72rem
// wide with 1-1.5rem gutters), so the browser picks the copy the screen needs:
// - Two-column phone cards say their real width, calc(50vw - 1.5rem) (two columns inside the
//   1rem gutters with a 0.75-1rem gap): a 412 px, 2.6x Pixel 7 needs 478 px and takes the
//   480 px copy. 47vw overstated them by ~11 px, enough to fetch the 960 px copy.
// - Full-width phone photos (hero, product viewer, brand page photos) say 20rem below 30rem:
//   every phone up to 3x then takes the 960 px copy (2.3x on a Pixel 7, still sharp) instead of
//   a 1024-1600 px original two to three times its bytes. 90vw (the real width) needed 973 px
//   on a Pixel 7, so a 1024 px original beat the 960 copy. From 30rem the real width again.
// The original serves wide screens. One export each, no imports: a route bundles only the
// strings it uses.

/** /menu cards: 1 column, 2 from 20rem, 3 from 48rem, 4 from 64rem. */
export const MENU_CARD_SIZES = "(min-width: 64rem) 17rem, (min-width: 48rem) 31vw, (min-width: 20rem) calc(50vw - 1.5rem), 100vw";
/** Home product rows: 1 column, 2 from 20rem, 3 from 48rem. */
export const CARD_SIZES = "(min-width: 72rem) 22rem, (min-width: 48rem) 31vw, (min-width: 20rem) calc(50vw - 1.5rem), 100vw";
/** Home category cards: full, half from 20rem, a quarter from 48rem. */
export const CATEGORY_SIZES = "(min-width: 72rem) 17rem, (min-width: 48rem) 24vw, (min-width: 20rem) calc(50vw - 1.5rem), 100vw";
/** Home hero: full width on phones, the 6/11 column from 48rem. */
export const HERO_SIZES = "(min-width: 72rem) 40rem, (min-width: 48rem) 55vw, (min-width: 30rem) 90vw, 20rem";
/** Home promotion cards (S-053 AC8): full width, 2 columns from 48rem. */
export const PROMO_CARD_SIZES = "(min-width: 72rem) 34rem, (min-width: 48rem) 47vw, (min-width: 30rem) 90vw, 20rem";
/** Gallery page tiles: 2 columns, 3 from 48rem. */
export const GALLERY_TILE_SIZES = "(min-width: 72rem) 22rem, (min-width: 48rem) 31vw, calc(50vw - 1.5rem)";
/** Home gallery preview: 2 columns, 3 from 23rem. */
export const GALLERY_PREVIEW_SIZES = "(min-width: 72rem) 22rem, (min-width: 23rem) 31vw, 47vw";
/** Product page viewer: full width on phones, half from 48rem. */
export const PRODUCT_VIEWER_SIZES = "(min-width: 72rem) 34rem, (min-width: 48rem) 47vw, (min-width: 30rem) 90vw, 20rem";
/** Brand page photos in the 48rem article: one per row, or two from 40rem. */
export const PAGE_SINGLE_SIZES = "(min-width: 50rem) 48rem, (min-width: 30rem) 90vw, 20rem";
export const PAGE_PAIR_SIZES = "(min-width: 50rem) 24rem, (min-width: 40rem) 47vw, (min-width: 30rem) 90vw, 20rem";
