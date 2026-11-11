import type { Lang, OptionGroup, Product, Selection } from '../domain/types'
import { formatRs } from '../domain/money'
import { pick } from '../i18n'
import { translate } from '../i18n'
import { inputCls } from './ui'

interface Props {
  product: Product
  sel: Selection
  onChange: (s: Selection) => void
  lang: Lang
  missing?: string[]
}

const priceTag = (n: number): string => (n === 0 ? '' : n > 0 ? `+${formatRs(n)}` : formatRs(n))

/** Renders every option group by kind. Used by the product page and the admin manual-order sheet. */
export function OptionPicker({ product, sel, onChange, lang, missing = [] }: Props) {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v)

  const toggle = (g: OptionGroup, id: string) => {
    const cur = sel.choices[g.id] ?? []
    const next = g.kind === 'one' ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    onChange({ ...sel, choices: { ...sel.choices, [g.id]: next } })
  }

  return (
    <div className="space-y-5">
      {product.groups.filter((g) => g.kind !== 'quantity').map((g) => {
        const bad = missing.includes(g.id)
        return (
          <fieldset key={g.id} className={`rounded-card border p-3 ${bad ? 'border-red-400 bg-red-50' : 'border-honey-200 bg-paper'}`}>
            <legend className="px-1 text-sm font-semibold">
              {pick(g.name, lang)}{' '}
              <span className="font-normal text-ink-soft">
                ({g.required ? t('common.required') : t('common.optional')}
                {g.kind === 'one' ? `, ${t('p.pickOne')}` : g.kind === 'several' ? `, ${t('p.pickSeveral')}` : ''})
              </span>
            </legend>
            {g.kind === 'text' ? (
              <div>
                <input
                  className={inputCls}
                  maxLength={g.charLimit}
                  value={sel.texts[g.id] ?? ''}
                  onChange={(e) => onChange({ ...sel, texts: { ...sel.texts, [g.id]: e.target.value } })}
                  aria-label={pick(g.name, lang)}
                />
                {g.charLimit && (
                  <p className="mt-1 text-right text-xs text-ink-soft" aria-live="polite">
                    {(sel.texts[g.id] ?? '').length}/{g.charLimit}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {g.choices.map((c) => {
                  const checked = (sel.choices[g.id] ?? []).includes(c.id)
                  return (
                    <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 ${checked ? 'bg-honey-100' : ''}`}>
                      <input
                        type={g.kind === 'one' ? 'radio' : 'checkbox'}
                        name={g.id}
                        aria-label={`${pick(g.name, lang)}: ${pick(c.name, lang)}`}
                        checked={checked}
                        onChange={() => toggle(g, c.id)}
                        className="h-5 w-5 accent-honey-600"
                      />
                      <span className="flex-1 text-sm">{pick(c.name, lang)}</span>
                      <span className="text-sm text-ink-soft">{priceTag(c.price)}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>
        )
      })}
    </div>
  )
}
