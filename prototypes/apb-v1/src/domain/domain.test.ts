import { describe, expect, it } from 'vitest'
import { formatRs } from './money'
import { addDays, muToMs, ymdOf } from './time'
import { bestPrice, priceLine, defaultSelection, selectionProblems, promoStatus } from './pricing'
import { dateProblem, earliestDate, noticeFor, removeDayFromBlocks } from './availability'
import { allowedMoves, canCustomerCancel, emailForMove, nextStatus, prevStatus } from './status'
import { quoteExpired } from './quote'
import { fillTemplate, normalisePhone } from './whatsapp'
import { prepList } from './prep'
import type { Order, Product, Promotion } from './types'

const product: Product = {
  id: 'p', type: 'cake', name: { en: 'Cake', fr: 'Gateau' }, desc: { en: '', fr: '' }, photos: [],
  basePrice: 1000, allergens: [], status: 'available', sort: 1,
  groups: [
    { id: 'size', name: { en: 'Size', fr: 'Taille' }, kind: 'one', required: true, choices: [
      { id: 's', name: { en: 'S', fr: 'S' }, price: 0 }, { id: 'l', name: { en: 'L', fr: 'L' }, price: 500 }] },
    { id: 'msg', name: { en: 'Msg', fr: 'Msg' }, kind: 'text', required: false, charLimit: 10, choices: [] },
  ],
}
const promo = (id: string, value: number, kind: 'percent' | 'fixed' = 'percent'): Promotion => ({
  id, title: { en: id, fr: id }, text: { en: '', fr: '' }, startMs: 1000, endMs: 2000, active: true,
  showBanner: true, showCard: true, link: { kind: 'none' }, items: [{ productId: 'p', kind, value }],
})

describe('format and time', () => {
  it('formats rupees', () => {
    expect(formatRs(1250)).toBe('Rs 1,250')
    expect(formatRs(90)).toBe('Rs 90')
    expect(formatRs(1234567)).toBe('Rs 1,234,567')
  })
  it('uses Mauritius date (UTC+4)', () => {
    expect(ymdOf(Date.parse('2026-11-09T21:00:00Z'))).toBe('2026-11-10')
    expect(ymdOf(muToMs('2026-11-09', '23:30'))).toBe('2026-11-09')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('pricing and promotions', () => {
  it('computes (base + options) x qty', () => {
    const sel = { ...defaultSelection(product), choices: { size: ['l'] }, qty: 2 }
    expect(priceLine(product, sel, [], 0).lineTotal).toBe(3000)
  })
  it('takes the lowest live promotion and never stacks', () => {
    expect(bestPrice(product, [promo('a', 10), promo('b', 25), promo('c', 0, 'fixed')], 1500).price).toBe(0)
    expect(bestPrice(product, [promo('a', 10), promo('b', 25)], 1500)).toMatchObject({ price: 750, promoId: 'b' })
  })
  it('discounts the base only, not options', () => {
    const sel = { ...defaultSelection(product), choices: { size: ['l'] } }
    expect(priceLine(product, sel, [promo('a', 20)], 1500).unit).toBe(800 + 500)
  })
  it('ignores promotions outside their window or inactive', () => {
    expect(bestPrice(product, [promo('a', 50)], 3000).price).toBe(1000)
    expect(promoStatus({ ...promo('a', 50), active: false }, 1500)).toBe('inactive')
    expect(promoStatus(promo('a', 50), 500)).toBe('scheduled')
  })
  it('blocks required options and over-long text', () => {
    expect(selectionProblems(product, defaultSelection(product)).map((p) => p.reason)).toEqual(['required'])
    const sel = { ...defaultSelection(product), choices: { size: ['s'] }, texts: { msg: 'x'.repeat(11) } }
    expect(selectionProblems(product, sel).map((p) => p.reason)).toEqual(['limit'])
  })
})

describe('availability', () => {
  const ctx = { today: '2026-11-09', noticeDays: 2, closedDays: [0], blocked: [{ id: 'b', from: '2026-11-12', to: '2026-11-12', reason: '', by: '' }] }
  it('applies notice, closed days and blocks', () => {
    expect(dateProblem('2026-11-10', ctx)).toBe('notice')
    expect(dateProblem('2026-11-11', ctx)).toBeNull()
    expect(dateProblem('2026-11-12', ctx)).toBe('blocked')
    expect(dateProblem('2026-11-15', ctx)).toBe('closed')
  })
  it('finds the earliest date and picks the largest notice', () => {
    expect(earliestDate(ctx)).toBe('2026-11-11')
    expect(earliestDate({ ...ctx, noticeDays: 3 })).toBe('2026-11-13')
    expect(noticeFor([{}, { noticeDays: 5 }, { noticeDays: 3 }], 2)).toBe(5)
    expect(noticeFor([{}], 2)).toBe(2)
  })
  it('splits a range when one day is unblocked', () => {
    const r = removeDayFromBlocks([{ id: 'x', from: '2026-12-24', to: '2026-12-26', reason: '', by: '' }], '2026-12-25')
    expect(r.map((b) => [b.from, b.to])).toEqual([['2026-12-24', '2026-12-24'], ['2026-12-26', '2026-12-26']])
  })
})

describe('status rules', () => {
  it('lets customers cancel only while pending or quote needed', () => {
    expect(canCustomerCancel('pending')).toBe(true)
    expect(canCustomerCancel('quote_needed')).toBe(true)
    expect(canCustomerCancel('approved')).toBe(false)
    expect(allowedMoves({ status: 'approved', fulfilment: 'pickup' }, 'customer')).toEqual([])
  })
  it('walks the happy path and back, by fulfilment', () => {
    expect(nextStatus({ status: 'preparing', fulfilment: 'pickup' })).toBe('ready')
    expect(nextStatus({ status: 'preparing', fulfilment: 'delivery' })).toBe('out')
    expect(prevStatus({ status: 'completed', fulfilment: 'delivery' })).toBe('out')
    expect(prevStatus({ status: 'approved', fulfilment: 'delivery' })).toBeNull()
  })
  it('maps moves to emails', () => {
    expect(emailForMove('pending', 'approved', 'website')).toBe('confirmed')
    expect(emailForMove('quote_needed', 'declined', 'custom')).toBe('request_declined')
    expect(emailForMove('approved', 'preparing', 'website')).toBeNull()
    expect(emailForMove('ready', 'completed', 'website')).toBe('thanks')
  })
})

describe('quote, whatsapp, prep', () => {
  it('expires after the expiry day', () => {
    expect(quoteExpired({ expiry: '2026-11-12' }, '2026-11-12')).toBe(false)
    expect(quoteExpired({ expiry: '2026-11-12' }, '2026-11-13')).toBe(true)
  })
  it('fills templates and normalises phones', () => {
    expect(fillTemplate('Hi {name}, {x}', { name: 'Amy' })).toBe('Hi Amy, {x}')
    expect(normalisePhone('5712 3456')).toBe('+23057123456')
    expect(normalisePhone('+33 6 12')).toBe('+33612')
    expect(normalisePhone('230 5712 3456')).toBe('+23057123456')
  })
  it('groups the prep list by product then size', () => {
    const mk = (n: string, size: string, qty: number, msg?: string): Order => ({
      number: n, date: '2026-11-10', status: 'approved',
      items: [{ id: 'i', name: { en: 'Cake', fr: 'G' }, qty, message: msg, options: [{ group: { en: 'Size', fr: '' }, choice: { en: size, fr: size }, price: 0, kind: 'one' }] }],
    } as unknown as Order)
    const list = prepList([mk('A', 'S', 1, 'Hi'), mk('B', 'S', 2), mk('C', 'L', 1)], '2026-11-10')
    expect(list).toHaveLength(1)
    expect(list[0].qty).toBe(4)
    expect(list[0].variants.find((v) => v.label === 'S')).toMatchObject({ qty: 3, messages: ['Hi (A)'] })
  })
})
