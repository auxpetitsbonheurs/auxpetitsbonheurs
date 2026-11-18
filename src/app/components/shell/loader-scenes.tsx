// The page loader's scenes (S-317 whisk, S-321 one scene per destination page): gold line art
// in the badge's 1024-unit space, drawn over the plain cream badge where its whisk was. Every
// scene is in the markup once (the full-page-load script picks one before React starts); CSS
// shows only the root's `data-scene` (app.css "S-321"), so only that one is drawn and animated.
// The bowl is one shape (#apb-loader-bowl) shared by the scenes, so the set reads as a family.
// `data-part` marks the moving parts; their still frame (reduced motion) is their CSS base state.

/** Solid gold for small filled parts (yolk, hearts, flame, sparkles). */
const FILL = { fill: "url(#apb-loader-fill)", stroke: "none" } as const;
const CUBE = "M484 112l28-16 28 16v32l-28 16-28-16Zm0 0 28 16 28-16m-28 16v32";

/**
 * A gold balloon whisk in the badge's style (gradient #BA8430 to #E2B65A), drawn upright about
 * its collar (0 0): handle below, wires above. Placed where the badge's own whisk was.
 */
function Whisk() {
  return (
    <g transform="translate(585 295) rotate(52)">
      <path d="M-7 8 -11 106a11 11 0 0 0 22 0L7 8Z" fill="url(#apb-loader-gold)" />
      <rect x="-12" y="-9" width="24" height="15" rx="5" fill="url(#apb-loader-gold)" />
      <g fill="none" stroke="url(#apb-loader-gold)" strokeWidth="6" strokeLinecap="round">
        {[66, 44, 20].map((k) => (
          <path key={k} d={`M-5 -8C${-k} -60 ${-k} -235 0 -235C${k} -235 ${k} -60 5 -8`} />
        ))}
        <path d="M0 -8V-235" />
      </g>
    </g>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="apb-loader-gold" gradientUnits="userSpaceOnUse" x1="0" y1="118" x2="0" y2="-235">
        <stop offset="0" stopColor="#BA8430" />
        <stop offset="1" stopColor="#E2B65A" />
      </linearGradient>
      <linearGradient id="apb-loader-line" gradientUnits="userSpaceOnUse" x1="0" y1="360" x2="0" y2="110">
        <stop offset="0" stopColor="#BA8430" />
        <stop offset="1" stopColor="#E2B65A" />
      </linearGradient>
      <linearGradient id="apb-loader-fill" x2="0" y2="1">
        <stop offset="0" stopColor="#E2B65A" />
        <stop offset="1" stopColor="#BA8430" />
      </linearGradient>
      <path id="apb-loader-bowl" d="M412 290c0 40 40 60 100 60s100-20 100-60M412 290a100 14 0 0 0 200 0 100 14 0 0 0-200 0M490 350v6h44v-6" />
      <path id="apb-loader-heart" d="M512 131C495 118 489 107 497 100 504 95 511 99 512 105 513 99 520 95 527 100 535 107 529 118 512 131Z" />
    </defs>
  );
}

/** S-317: the whisk stirring in circles and the heart floating up (Home and every other page). */
function WhiskScene() {
  return (
    <g data-loader-scene="whisk">
      <g data-loader-heart>
        <path transform="translate(505 240) scale(.9)" fill="none" stroke="url(#apb-loader-gold)" strokeWidth="9" strokeLinejoin="round" d="M0 30C-40 0-55-25-35-42-20-55-3-45 0-30 3-45 20-55 35-42 55-25 40 0 0 30Z" />
      </g>
      <g data-loader-stir>
        <g data-loader-tilt>
          <Whisk />
        </g>
      </g>
    </g>
  );
}

/** Our story: an egg cracks, its halves open and the yolk drops into the bowl. */
function EggScene() {
  return (
    <g data-loader-scene="egg">
      <use href="#apb-loader-bowl" />
      <ellipse data-part="egg-ripple" cx="512" cy="292" rx="40" ry="6" strokeWidth="5" />
      <circle data-part="egg-yolk" cx="512" cy="196" r="17" {...FILL} />
      <path data-part="egg-whole" d="M512 118c30 0 53 45 53 77s-23 47-53 47-53-15-53-47 23-77 53-77Z" />
      <path data-part="egg-l" d="M512 118c-30 0-53 45-53 77s23 47 53 47l-8-14 13-16-14-16 14-16-13-16 12-16-6-14Z" />
      <path data-part="egg-r" d="M512 118c30 0 53 45 53 77s-23 47-53 47l-8-14 13-16-14-16 14-16-13-16 12-16-6-14Z" />
    </g>
  );
}

/** Menu and cake pages: sugar cubes tumble into the bowl, two sparkles twinkle. */
function SugarScene() {
  return (
    <g data-loader-scene="sugar">
      <use href="#apb-loader-bowl" />
      {[-6, 30, -28].map((dx, i) => (
        <g key={dx} transform={`translate(${dx})`}>
          <path data-part={`cube${i + 1}`} d={CUBE} />
        </g>
      ))}
      <path data-part="spark1" {...FILL} d="M430 236l4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" />
      <path data-part="spark2" {...FILL} d="M596 196l4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" />
    </g>
  );
}

/** Custom order: a flour sack (wheat ear on it) tips, flour pours, a soft puff rises. */
function FlourScene() {
  return (
    <g data-loader-scene="flour">
      <use href="#apb-loader-bowl" />
      <path data-part="flour-stream" strokeWidth="9" strokeDasharray="0 15" d="M508 214c4 22 5 46 4 68" />
      <path data-part="flour-puff" strokeWidth="6" d="M474 274a14 14 0 0 1 12-24 20 20 0 0 1 38-4 14 14 0 0 1 14 28" />
      <g data-part="flour-sack">
        <g transform="translate(456 180) rotate(126)">
          <path d="M-22-40c-22 16-28 52-20 88h84c8-36 2-72-20-88M-26-40h52M-22-40l-12-22 18 8 6-12 6 12 18-8-12 22" />
          <path strokeWidth="5" d="M0 34V-12m0 10c-9-1-13-8-12-15 8 1 12 8 12 15 9-1 13-8 12-15-8 1-12 8-12 15m0 14c-9-1-13-8-12-15 8 1 12 8 12 15 9-1 13-8 12-15-8 1-12 8-12 15" />
        </g>
      </g>
    </g>
  );
}

/** Workshops: tiny hearts pour into the bowl. */
function HeartsScene() {
  return (
    <g data-loader-scene="hearts">
      <use href="#apb-loader-bowl" />
      {[-12, 16, -18, 10].map((dx, i) => (
        <g key={dx} transform={`translate(${dx})`}>
          <use data-part={`drop${i + 1}`} href="#apb-loader-heart" {...FILL} />
        </g>
      ))}
    </g>
  );
}

/** Gallery: the bowl goes into the oven, the door closes, the window glows warm. */
function OvenScene() {
  return (
    <g data-loader-scene="oven">
      <rect x="417" y="128" width="190" height="212" rx="18" />
      <path d="M417 174h190" />
      <circle cx="448" cy="151" r="9" />
      <circle cx="479" cy="151" r="9" />
      <rect x="522" y="142" width="58" height="18" rx="5" strokeWidth="6" />
      <rect x="435" y="192" width="154" height="136" rx="12" strokeWidth="5" />
      <rect data-part="oven-glow" x="447" y="226" width="130" height="90" rx="10" {...FILL} />
      <g transform="translate(297 145) scale(.42)">
        <use data-part="oven-bowl" href="#apb-loader-bowl" strokeWidth="16" />
      </g>
      <g data-part="oven-door">
        <path fill="#FFF1E1" fillRule="evenodd" d="M447 192h130a12 12 0 0 1 12 12v120H435V204a12 12 0 0 1 12-12Zm8 34v82h114v-82Z" />
        <path d="M472 210h80" />
      </g>
    </g>
  );
}

/** Contact: a layered cake on a stand, its candle flickering, a little heart rising. */
function CakeScene() {
  return (
    <g data-loader-scene="cake">
      <path d="M422 334h180M512 334v14M486 352h52" />
      <rect x="442" y="268" width="140" height="66" rx="10" />
      <rect x="470" y="218" width="84" height="50" rx="8" />
      <path strokeWidth="6" d="M442 290c12 10 23 10 35 0s23-10 35 0 23 10 35 0 23-10 35 0M470 238c10 8 21 8 31 0s21-8 31 0 21 8 22 0" />
      <rect x="505" y="176" width="14" height="42" rx="3" strokeWidth="6" />
      <path data-part="cake-flame" {...FILL} d="M512 128c11 14 16 25 10 34a12 12 0 0 1-20 0c-6-9-1-20 10-34Z" />
      <use data-part="cake-heart" href="#apb-loader-heart" strokeWidth="5" />
    </g>
  );
}

/** The overlay's SVG over the badge: every scene, the root's `data-scene` shows one. */
export function LoaderScenes() {
  return (
    <svg viewBox="0 0 1024 1024" className="absolute inset-0 size-full overflow-visible">
      <Defs />
      <WhiskScene />
      {/* Line scenes: 1.12× about the bowl's foot, so they fill the whisk's space above the name. */}
      <g transform="matrix(1.12 0 0 1.12 -61.44 -48)" fill="none" stroke="url(#apb-loader-line)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        <EggScene />
        <SugarScene />
        <FlourScene />
        <HeartsScene />
        <OvenScene />
        <CakeScene />
      </g>
    </svg>
  );
}
