import { useCallback } from 'react'
import type { L, Lang } from '../domain/types'
import { fmtDate } from '../domain/time'
import { langStore } from '../mocks/store'
import { en, type Key } from './en'
import { fr } from './fr'

const DICT: Record<Lang, Record<Key, string>> = { en, fr }

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = DICT[lang][key] || en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  return s
}

/** Admin screens are English only: this is the English label for a key. */
export const tEn = (key: Key, vars?: Record<string, string | number>): string => translate('en', key, vars)

/** Bilingual content text with fallback to English. */
export const pick = (l: L, lang: Lang): string => l[lang] || l.en

export function useI18n() {
  const lang = langStore.use()
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
  const tl = useCallback((l: L) => pick(l, lang), [lang])
  const date = useCallback((ymd: string, long = false) => fmtDate(ymd, lang, long), [lang])
  return { lang, t, tl, date, setLang: (l: Lang) => langStore.set(l) }
}

export type { Key }
