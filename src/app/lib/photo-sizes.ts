// `sizes` of each place photos show (S-276), from its grid (the site frame is at most 72rem
// wide with 1-1.5rem gutters). With a 2.6x phone screen the browser then picks the 480 px
// copy for a two-column card. Full-width phone photos say 90vw, not 100vw: that caps them
// near 2.3x, so a 412 px Pixel 7 takes the 960 px copy (still sharp) instead of a 1200 px
// original only ~10% wider. The original serves wide screens. One export each, no imports:
// a route bundles only the strings it uses.

/** /menu cards: 1 column, 2 from 20rem, 3 from 48rem, 4 from 64rem. */
export const MENU_CARD_SIZES = "(min-width: 64rem) 17rem, (min-width: 48rem) 31vw, (min-width: 20rem) 47vw, 100vw";
/** Home product rows: 1 column, 2 from 20rem, 3 from 48rem. */
export const CARD_SIZES = "(min-width: 72rem) 22rem, (min-width: 48rem) 31vw, (min-width: 20rem) 47vw, 100vw";
/** Home category cards: full, half from 20rem, a quarter from 48rem. */
export const CATEGORY_SIZES = "(min-width: 72rem) 17rem, (min-width: 48rem) 24vw, (min-width: 20rem) 47vw, 100vw";
/** Home hero: full width on phones, the 6/11 column from 48rem. */
export const HERO_SIZES = "(min-width: 72rem) 40rem, (min-width: 48rem) 55vw, 90vw";
/** Gallery page tiles: 2 columns, 3 from 48rem. */
export const GALLERY_TILE_SIZES = "(min-width: 72rem) 22rem, (min-width: 48rem) 31vw, 47vw";
/** Home gallery preview: 2 columns, 3 from 23rem. */
export const GALLERY_PREVIEW_SIZES = "(min-width: 72rem) 22rem, (min-width: 23rem) 31vw, 47vw";
/** Product page viewer: full width on phones, half from 48rem. */
export const PRODUCT_VIEWER_SIZES = "(min-width: 72rem) 34rem, (min-width: 48rem) 47vw, 90vw";
/** Brand page photos in the 48rem article: one per row, or two from 40rem. */
export const PAGE_SINGLE_SIZES = "(min-width: 50rem) 48rem, 90vw";
export const PAGE_PAIR_SIZES = "(min-width: 50rem) 24rem, (min-width: 40rem) 47vw, 90vw";
