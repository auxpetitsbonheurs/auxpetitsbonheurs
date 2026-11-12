import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

// Brand v0.3 burgundy / cream / antique gold: flat buttons, radius 12px, min-height 48px; no gradients, no heavy shadows.
type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'onBand'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-wine-600 text-paper hover:bg-wine-800 disabled:opacity-50',
  // Secondary action on a burgundy band: cream outline pill (custom-cake call-out).
  onBand: '!rounded-full border border-cream text-cream hover:bg-cream hover:text-wine-700',
  outline: 'border border-wine-600 bg-paper text-wine-700 hover:bg-wine-100 disabled:opacity-50',
  ghost: 'text-wine-700 hover:bg-wine-100 disabled:opacity-50',
  danger: 'border border-red-700 bg-paper text-red-700 hover:bg-red-50 disabled:opacity-50',
}
export const btn = (v: Variant = 'primary', extra = ''): string =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-2 text-center text-base font-semibold transition-colors ${VARIANTS[v]} ${extra}`

// Input border ink-line (#8C6E66) keeps >= 3:1 against cream and paper (WCAG 1.4.11).
export const inputCls =
  'min-h-11 w-full rounded-xl border border-ink-line bg-paper px-3 text-base text-ink placeholder:text-ink-soft focus:border-wine-600'

export const card = 'rounded-card border border-wine-200 bg-paper p-4'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const id = useId()
  // The <label htmlFor> names the control: no copied aria-label on the child.
  const child = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children
  return (
    <div className="block">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      {child}
      {hint && !error && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs font-semibold text-red-700">{error}</span>}
    </div>
  )
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold transition-colors ${
        active ? 'border-wine-600 bg-wine-600 text-paper' : 'border-ink-line bg-paper text-ink hover:bg-wine-100'
      }`}
    >
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'wine' }: { children: ReactNode; tone?: 'wine' | 'green' | 'amber' | 'grey' | 'red' }) {
  const tones = {
    wine: 'bg-wine-200 text-wine-700', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800',
    grey: 'bg-stone-200 text-stone-700', red: 'bg-red-100 text-red-800',
  }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-band bg-cream p-5 sm:rounded-band">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl text-2xl leading-none hover:bg-wine-100" aria-label="Close">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

type QtyTranslate = (key: 'qty.of' | 'qty.inc' | 'qty.dec', vars: { name: string }) => string
/** Distinct accessible names for a product's quantity stepper. */
export const qtyLabels = (t: QtyTranslate, name: string) => ({
  label: t('qty.of', { name }), incLabel: t('qty.inc', { name }), decLabel: t('qty.dec', { name }),
})

/** Quantity stepper: the group and field are named by `label`, each button by its own name. */
export function Stepper({ value, min, max, onChange, label, decLabel, incLabel }: {
  value: number; min: number; max: number; onChange: (n: number) => void; label: string; decLabel: string; incLabel: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const step = 'min-h-11 min-w-11 rounded-xl text-xl text-wine-700 hover:bg-wine-100 disabled:text-ink-line disabled:hover:bg-transparent'
  return (
    <div className="inline-flex items-center rounded-xl border border-ink-line bg-paper" role="group" aria-label={label}>
      <button type="button" className={step} onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={decLabel}>&minus;</button>
      <input
        inputMode="numeric"
        aria-label={label}
        className="w-12 bg-transparent text-center text-base font-semibold"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
          onChange(Number.isNaN(n) ? min : clamp(n))
        }}
      />
      <button type="button" className={step} onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={incLabel}>+</button>
    </div>
  )
}

/** Shrinks an image file to a small JPEG data URL (done on the device, nothing is uploaded). */
export function shrinkImage(file: File, maxSide = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('not an image'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
