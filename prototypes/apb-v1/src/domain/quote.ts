import type { Quote } from './types'
import { addDays } from './time'

export const defaultQuoteExpiry = (today: string, validityDays: number): string => addDays(today, validityDays)

/** A quote is valid through the end of its expiry day (Mauritius). */
export const quoteExpired = (q: Pick<Quote, 'expiry'>, today: string): boolean => today > q.expiry
