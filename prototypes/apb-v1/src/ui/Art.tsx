/** Locally generated illustrations. Photo ids look like "art:cake:2" (kind : palette). */
interface Palette { bg: string; a: string; b: string; c: string }

const PALETTES: Palette[] = [
  { bg: '#FDE4E9', a: '#F8B8C5', b: '#E88598', c: '#FFF3F5' },
  { bg: '#FFE9D6', a: '#FBC9A0', b: '#E39A68', c: '#FFF6EC' },
  { bg: '#DFF2E6', a: '#B5E0C4', b: '#6DB58A', c: '#F4FBF6' },
  { bg: '#EBE3F8', a: '#CFC0F0', b: '#9A86D0', c: '#F8F5FE' },
  { bg: '#FFF3C9', a: '#FBE08A', b: '#E0B94A', c: '#FFFBE8' },
  { bg: '#DCEBFA', a: '#B6D3F2', b: '#6E9FD6', c: '#F3F8FE' },
]
const SPONGE = '#F3D9B1'
const CHOC = '#7A4B3A'

function Cake({ p }: { p: Palette }) {
  return (
    <g>
      <ellipse cx="100" cy="168" rx="78" ry="9" fill="#fff" opacity=".7" />
      <rect x="38" y="112" width="124" height="52" rx="10" fill={SPONGE} />
      <path d="M38 126 q10 14 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v-14 h-120z" fill={p.a} />
      <rect x="60" y="72" width="80" height="42" rx="9" fill={SPONGE} />
      <path d="M60 86 q10 14 20 0 t20 0 t20 0 t20 0 v-14 h-80z" fill={p.b} />
      <circle cx="82" cy="68" r="7" fill="#D6455D" />
      <circle cx="104" cy="64" r="7" fill="#D6455D" />
      <circle cx="124" cy="69" r="6" fill="#D6455D" />
      <rect x="99" y="44" width="5" height="16" rx="2" fill={p.c} />
      <path d="M101.500 36 q4 6 0 9 q-4 -3 0 -9z" fill="#F7B733" />
    </g>
  )
}
function Cupcake({ p }: { p: Palette }) {
  return (
    <g>
      <path d="M60 110 h80 l-10 56 h-60z" fill={p.b} />
      {[76, 92, 108, 124].map((x) => <path key={x} d={`M${x} 110 l${x < 100 ? -2 : 2} 56`} stroke={p.c} strokeWidth="3" opacity=".5" />)}
      <ellipse cx="100" cy="108" rx="48" ry="16" fill={p.a} />
      <ellipse cx="100" cy="88" rx="36" ry="14" fill={p.c} />
      <ellipse cx="100" cy="70" rx="24" ry="11" fill={p.a} />
      <circle cx="100" cy="54" r="7" fill="#D6455D" />
    </g>
  )
}
function Cup({ p }: { p: Palette }) {
  return (
    <g>
      <path d="M56 70 h88 l-12 90 h-64z" fill="#fff" opacity=".85" />
      <path d="M60 100 h80 l-3 24 h-74z" fill={p.a} />
      <path d="M64 124 h72 l-4 32 h-64z" fill={CHOC} />
      <path d="M58 82 h84 l-2 18 h-80z" fill={p.c} />
      <ellipse cx="100" cy="70" rx="44" ry="8" fill={p.c} />
      <path d="M78 66 q22 -34 44 0z" fill={p.c} />
      <circle cx="100" cy="46" r="7" fill="#D6455D" />
    </g>
  )
}
function Log({ p }: { p: Palette }) {
  return (
    <g>
      <rect x="30" y="86" width="140" height="62" rx="30" fill={CHOC} />
      <ellipse cx="160" cy="117" rx="18" ry="31" fill={SPONGE} />
      <ellipse cx="160" cy="117" rx="10" ry="19" fill={CHOC} opacity=".55" />
      <path d="M44 100 q20 -8 40 0 t40 0" stroke={p.c} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M70 84 q8 -22 22 -10 q-6 14 -22 10z M96 84 q10 -24 24 -8 q-8 14 -24 8z" fill="#4E9A62" />
      <circle cx="96" cy="82" r="5" fill="#D6455D" />
      <circle cx="105" cy="85" r="5" fill="#D6455D" />
      <ellipse cx="60" cy="150" rx="9" ry="7" fill="#fff" />
      <ellipse cx="82" cy="152" rx="7" ry="6" fill="#fff" />
    </g>
  )
}
function Macaron({ p }: { p: Palette }) {
  const m = (x: number, y: number, fill: string, cream: string) => (
    <g key={`${x}${y}`}>
      <ellipse cx={x} cy={y - 7} rx="30" ry="12" fill={fill} />
      <rect x={x - 28} y={y - 6} width="56" height="9" rx="4" fill={cream} />
      <ellipse cx={x} cy={y + 6} rx="30" ry="12" fill={fill} />
    </g>
  )
  return (
    <g>
      <rect x="30" y="130" width="140" height="34" rx="8" fill={p.b} opacity=".85" />
      {m(66, 124, p.a, p.c)}
      {m(134, 124, p.b, p.c)}
      {m(100, 92, p.a, '#fff')}
    </g>
  )
}

const KINDS: Record<string, (p: { p: Palette }) => JSX.Element> = {
  cake: Cake, cupcake: Cupcake, cup: Cup, log: Log, macaron: Macaron,
}

export function Art({ id, className = '' }: { id: string; className?: string }) {
  const [, kind = 'cake', idx = '0'] = id.split(':')
  const Shape = KINDS[kind] ?? Cake
  const p = PALETTES[Number(idx) % PALETTES.length]
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="200" fill={p.bg} />
      <circle cx="30" cy="30" r="22" fill={p.c} opacity=".7" />
      <circle cx="176" cy="48" r="12" fill={p.c} opacity=".6" />
      <Shape p={p} />
    </svg>
  )
}

export const ART_CHOICES = ['cake', 'cupcake', 'cup', 'log', 'macaron'].flatMap((k) =>
  [0, 1, 2, 3, 4, 5].map((i) => `art:${k}:${i}`))

/** A photo is either a generated illustration or an uploaded data URL. */
export function Photo({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  if (src.startsWith('art:')) return <div className={className} role="img" aria-label={alt}><Art id={src} className="h-full w-full" /></div>
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />
}
