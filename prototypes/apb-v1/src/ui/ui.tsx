import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-200 disabled:text-white',
  outline: 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50',
  ghost: 'text-rose-700 hover:bg-rose-50 disabled:opacity-50',
  danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50',
}
export const btn = (v: Variant = 'primary', extra = ''): string =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition ${VARIANTS[v]} ${extra}`

export const inputCls =
  'min-h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-base text-ink placeholder:text-ink-soft/60 focus:border-rose-500'

export const card = 'rounded-2xl bg-white p-4 shadow-soft'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const id = useId()
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; 'aria-label'?: string }>, { id, 'aria-label': label })
    : children
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
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
        active ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-200 bg-white text-ink hover:bg-rose-50'
      }`}
    >
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'rose' }: { children: ReactNode; tone?: 'rose' | 'green' | 'amber' | 'grey' | 'red' }) {
  const tones = {
    rose: 'bg-rose-100 text-rose-700', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800',
    grey: 'bg-stone-200 text-stone-700', red: 'bg-red-100 text-red-800',
  }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream p-5 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full text-2xl leading-none hover:bg-rose-50" aria-label="Close">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="inline-flex items-center rounded-full border border-rose-200 bg-white" role="group" aria-label={label}>
      <button type="button" className="min-h-11 min-w-11 text-xl" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label="-">&minus;</button>
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
      <button type="button" className="min-h-11 min-w-11 text-xl" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label="+">+</button>
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
