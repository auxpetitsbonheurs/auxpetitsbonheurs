import type {
  Admin, Customer, Db, Fulfilment, Order, OrderEvent, OrderItem, Promotion, Selection, Settings, Source, Status,
} from '../domain/types'
import { addDays, muToMs, ymdOf } from '../domain/time'
import { defaultSelection, priceLine } from '../domain/pricing'
import { seedProducts } from './seedProducts'

const HOUR = 3600 * 1000

function seedSettings(): Settings {
  return {
    defaultNotice: 3,
    closedDays: [0],
    windows: [
      { id: 'morning', name: { en: 'Morning', fr: 'Matin' }, from: '09:00', to: '12:00' },
      { id: 'afternoon', name: { en: 'Afternoon', fr: 'Après-midi' }, from: '12:00', to: '17:00' },
      { id: 'evening', name: { en: 'Evening', fr: 'Soirée' }, from: '17:00', to: '20:00' },
    ],
    deliveryFee: 200,
    quoteValidity: 5,
    prefix: 'APB-',
    juice: '5700 0000 (placeholder)',
    pickupAddress: '12 Rue des Fleurs, Curepipe, Mauritius (placeholder)',
    mapLink: 'https://maps.google.com/?q=Curepipe+Mauritius',
    whatsapp: '+230 5700 0000',
    phone: '+230 5700 0000',
    email: 'hello@auxpetitsbonheurs.example',
    instagram: 'https://instagram.com/auxpetitsbonheurs',
    messageLimit: 40,
    featured: ['p-choc', 'p-cupcake', 'p-macaron'],
    templates: {
      approved: {
        en: 'Hello {name}, your order {order_number} is confirmed for {date} ({window}). Track it here: {tracking_link}. Thank you!',
        fr: 'Bonjour {name}, votre commande {order_number} est confirmée pour le {date} ({window}). Suivi : {tracking_link}. Merci !',
      },
      ready: {
        en: 'Hello {name}, your order {order_number} is ready for pickup at {pickup_address} ({window}).',
        fr: 'Bonjour {name}, votre commande {order_number} est prête à retirer au {pickup_address} ({window}).',
      },
      onway: {
        en: 'Hello {name}, your order {order_number} is on its way ({window}).',
        fr: 'Bonjour {name}, votre commande {order_number} est en route ({window}).',
      },
      payment: {
        en: 'Hello {name}, a reminder for order {order_number}: total {total}. Pay by Juice on {juice_number} or cash on delivery/pickup. Thank you!',
        fr: 'Bonjour {name}, rappel pour la commande {order_number} : total {total}. Paiement par Juice au {juice_number} ou en espèces à la livraison/au retrait. Merci !',
      },
      blank: { en: 'Hello {name}, ', fr: 'Bonjour {name}, ' },
    },
    tagline: { en: 'Little joys, baked with love.', fr: 'De petits bonheurs, pétris d\'amour.' },
    about: {
      en: 'Aux petits bonheurs is a home bakery in Mauritius. Every cake is baked to order in a small family kitchen, with real butter and a lot of love.',
      fr: 'Aux petits bonheurs est une pâtisserie artisanale à l\'île Maurice. Chaque gâteau est préparé sur commande dans une petite cuisine familiale, avec du vrai beurre et beaucoup d\'amour.',
    },
    faq: {
      en: 'How far ahead should I order? At least 3 days (some cakes need more). We are closed on Sundays.\nHow do I pay? Juice or cash on delivery or pickup.\nHow do I store my cake? Keep it refrigerated, take it out about 30 minutes before serving, and enjoy it within 2-3 days.\nCan I cancel after approval? Yes, free of charge via WhatsApp until 48 hours before your order date. After that, no refund is possible.',
      fr: 'Combien de temps à l\'avance commander ? Au moins 3 jours (certains gâteaux demandent plus). Nous sommes fermés le dimanche.\nComment payer ? Juice ou espèces à la livraison ou au retrait.\nComment conserver mon gâteau ? Gardez-le au réfrigérateur, sortez-le environ 30 minutes avant de servir et dégustez-le dans les 2 à 3 jours.\nPuis-je annuler après l\'approbation ? Oui, gratuitement via WhatsApp jusqu\'à 48 heures avant la date de votre commande. Passé ce délai, aucun remboursement n\'est possible.',
    },
    policies: {
      en: 'Your order is not confirmed until the bakery approves it. Cancellations are free while the order is pending; after approval you can cancel free of charge via WhatsApp until 48 hours before your order date; after that there is no refund. Our kitchen handles gluten, eggs, milk, nuts and soy.',
      fr: 'Votre commande n\'est confirmée qu\'après approbation de la pâtisserie. L\'annulation est gratuite tant que la commande est en attente ; après approbation, vous pouvez annuler gratuitement via WhatsApp jusqu\'à 48 heures avant la date de commande ; passé ce délai, aucun remboursement. Notre cuisine manipule gluten, œufs, lait, fruits à coque et soja.',
    },
  }
}

function seedPromos(now: number): Promotion[] {
  const today = ymdOf(now)
  return [
    {
      id: 'promo-live',
      title: { en: 'Birthday season: 15% off our chocolate cake', fr: 'Saison des anniversaires : -15% sur le gâteau chocolat' },
      text: { en: 'Automatic discount on the base price. No code needed.', fr: 'Réduction automatique sur le prix de base. Aucun code requis.' },
      startMs: muToMs(addDays(today, -1)), endMs: muToMs(addDays(today, 7), '23:59'),
      active: true, showBanner: true, showCard: true, link: { kind: 'product', ref: 'p-choc' },
      items: [{ productId: 'p-choc', kind: 'percent', value: 15 }],
    },
    {
      id: 'promo-scheduled',
      title: { en: 'Christmas pre-order: yule log Rs 1,800', fr: 'Précommande de Noël : bûche à Rs 1,800' },
      text: { en: 'Sale price for early birds.', fr: 'Prix réduit pour les plus matinaux.' },
      startMs: muToMs(addDays(today, 14)), endMs: muToMs(addDays(today, 21), '23:59'),
      active: true, showBanner: false, showCard: true, link: { kind: 'product', ref: 'p-yule' },
      items: [{ productId: 'p-yule', kind: 'fixed', value: 1800 }],
    },
  ]
}

function seedAdmins(): Admin[] {
  const base = { active: true, invited: false, lang: 'en' as const, alerts: { push: true, email: true } }
  return [
    { ...base, id: 'adm-sabera', name: 'Sabera', email: 'sabera@auxpetitsbonheurs.example', role: 'owner', lastSignIn: null },
    { ...base, id: 'adm-sarah', name: 'Sarah', email: 'sarah@auxpetitsbonheurs.example', role: 'admin', lastSignIn: null },
  ]
}

interface OrderSeed {
  n: number
  source?: Source
  status: Status
  fulfilment: Fulfilment
  day: number
  window: string
  items: OrderItem[]
  name: string
  phone: string
  email: string
  lang?: 'en' | 'fr'
  paid?: boolean
  token: string
  hoursAgo: number
  extra?: Partial<Order>
  log?: [string, string, string?][]
}

export function seedDb(now: number): Db {
  const today = ymdOf(now)
  const products = seedProducts({ start: addDays(today, -10), end: addDays(today, 60) })
  const settings = seedSettings()
  const fee = settings.deliveryFee

  const item = (pid: string, choices: Record<string, string[]>, qty = 1, texts: Record<string, string> = {}): OrderItem => {
    const p = products.find((x) => x.id === pid)!
    const sel: Selection = { ...defaultSelection(p), choices, texts, qty }
    return { id: '', ...priceLine(p, sel, [], now) }
  }

  const orders: Order[] = []
  const add = (s: OrderSeed) => {
    const number = `${settings.prefix}${String(s.n).padStart(4, '0')}`
    const createdAt = now - s.hoursAgo * HOUR
    const delivery = s.fulfilment === 'delivery'
    const items = s.items.map((it, i) => ({ ...it, id: `${number}-i${i}` }))
    const deliveryFee = delivery && s.source !== 'custom' ? fee : 0
    const events: OrderEvent[] = [
      { at: createdAt, by: { kind: 'customer', name: s.name }, what: s.source === 'manual' ? 'created (manual)' : s.source === 'custom' ? 'request sent' : 'placed' },
      ...(s.log ?? []).map(([who, what, details], i): OrderEvent => ({
        at: createdAt + (i + 1) * HOUR, by: { kind: 'admin', name: who }, what, details,
      })),
    ]
    orders.push({
      id: `o-${s.n}`, number, source: s.source ?? 'website', status: s.status,
      customer: { name: s.name, phone: s.phone, email: s.email },
      fulfilment: s.fulfilment,
      address: delivery ? 'Royal Road, Rose-Hill' : '',
      landmark: delivery ? 'Blue gate next to the pharmacy' : '',
      date: addDays(today, s.day), window: s.window, items, deliveryFee,
      total: items.reduce((t, i) => t + i.lineTotal, 0) + deliveryFee,
      paid: s.paid ?? false, customerNote: '', adminNote: '', lang: s.lang ?? 'en',
      token: s.token, createdAt, version: 1, events, ...s.extra,
    })
  }

  add({ n: 1, status: 'pending', fulfilment: 'pickup', day: 3, window: 'morning', name: 'Priya Ramdin', phone: '+230 5712 3456', email: 'priya@example.com', token: 'pending-demo-7k2m9xq4', hoursAgo: 3,
    items: [item('p-cupcake', { 'cup-size': ['cup-s1'], 'cup-flavour': ['cup-f0', 'cup-f1'] })] })
  add({ n: 2, status: 'pending', fulfilment: 'delivery', day: 2, window: 'afternoon', name: 'Jean-Marc Lagesse', phone: '+230 5944 1122', email: 'jm@example.com', lang: 'fr', token: 'pending-demo-2b8d5nr1', hoursAgo: 5,
    items: [item('p-choc', { 'choc-size': ['choc-s1'], 'choc-flavour': ['choc-f0'], 'choc-addons': ['choc-a0'] }, 1, { 'choc-msg': 'Joyeux anniversaire Amy' })] })
  add({ n: 3, status: 'approved', fulfilment: 'delivery', day: 0, window: 'afternoon', name: 'Nadia Soobrun', phone: '+230 5801 7788', email: 'nadia@example.com', token: 'approved-demo-9c2v7zk3', hoursAgo: 30,
    items: [item('p-vanilla', { 'van-size': ['van-s0'], 'van-flavour': ['van-f0'], 'van-addons': ['van-a0'] })], log: [['Sarah', 'approved']] })
  add({ n: 4, status: 'preparing', fulfilment: 'pickup', day: 0, window: 'morning', name: 'Kevin Li', phone: '+230 5455 9090', email: '', token: 'prep-demo-5t1w8yj6', hoursAgo: 40, paid: true,
    items: [item('p-cupcake', { 'cup-size': ['cup-s0'], 'cup-flavour': ['cup-f2', 'cup-f3'] })], log: [['Sarah', 'approved'], ['Sabera', 'status changed', 'Approved to In preparation']] })
  add({ n: 5, status: 'out', fulfilment: 'delivery', day: 0, window: 'evening', name: 'Anaïs Henry', phone: '+230 5622 4040', email: 'anais@example.com', lang: 'fr', token: 'out-demo-8f3q6mz2', hoursAgo: 50,
    items: [item('p-mousse', { 'mou-flavour': ['mou-f0'] }, 12)], log: [['Sabera', 'approved'], ['Sabera', 'status changed', 'Approved to In preparation'], ['Sarah', 'status changed', 'In preparation to Out for delivery']] })
  add({ n: 6, status: 'approved', fulfilment: 'pickup', day: 1, window: 'evening', name: 'Priya Ramdin', phone: '+230 5712 3456', email: 'priya@example.com', token: 'approved-demo-1x9p4ls8', hoursAgo: 26, paid: true,
    items: [item('p-macaron', { 'mac-size': ['mac-s1'] })], log: [['Sarah', 'approved'], ['Sarah', 'marked paid']] })
  add({ n: 7, source: 'manual', status: 'approved', fulfilment: 'delivery', day: 1, window: 'morning', name: 'Sandra Dubois', phone: '+230 5333 1212', email: '', token: 'manual-demo-6g7e2ha5', hoursAgo: 20,
    items: [{ id: '', name: { en: 'Wedding favours (free item)', fr: 'Cadeaux de mariage (article libre)' }, options: [], qty: 30, basePrice: 45, originalBase: 45, unit: 45, lineTotal: 1350 }],
    log: [['Sabera', 'approved', 'manual order']] })
  add({ n: 8, status: 'approved', fulfilment: 'delivery', day: 4, window: 'afternoon', name: 'Deepak Gopaul', phone: '+230 5270 6655', email: 'deepak@example.com', token: 'approved-demo-4k8s1vd9', hoursAgo: 12,
    items: [item('p-choc', { 'choc-size': ['choc-s2'], 'choc-flavour': ['choc-f1'], 'choc-addons': ['choc-a1', 'choc-a2'] }, 1, { 'choc-msg': 'Happy 50th Dad!' })], log: [['Sarah', 'approved']] })
  add({ n: 9, status: 'completed', fulfilment: 'pickup', day: -2, window: 'morning', name: 'Kevin Li', phone: '+230 5455 9090', email: '', token: 'done-demo-3m2n7bt7', hoursAgo: 120, paid: true,
    items: [item('p-cupcake', { 'cup-size': ['cup-s0'], 'cup-flavour': ['cup-f0'] })], log: [['Sarah', 'approved'], ['Sarah', 'status changed', 'Approved to In preparation'], ['Sabera', 'status changed', 'In preparation to Ready for pickup'], ['Sabera', 'status changed', 'Ready for pickup to Completed']] })
  add({ n: 10, status: 'cancelled', fulfilment: 'pickup', day: 5, window: 'morning', name: 'Marie Laval', phone: '+230 5111 3030', email: 'marie@example.com', lang: 'fr', token: 'cancel-demo-0z5c3rg4', hoursAgo: 60,
    items: [item('p-macaron', { 'mac-size': ['mac-s0'] })] })
  orders[orders.length - 1].events.push({ at: now - 55 * HOUR, by: { kind: 'customer', name: 'Marie Laval' }, what: 'cancelled' })

  add({ n: 11, source: 'custom', status: 'quote_needed', fulfilment: 'pickup', day: 10, window: 'afternoon', name: 'Aisha Khodabux', phone: '+230 5909 8080', email: 'aisha@example.com', token: 'quote-demo-4h8d1qw2', hoursAgo: 2, items: [],
    extra: { custom: { occasion: 'wedding', servings: '60', flavours: 'Vanilla and raspberry', theme: 'Soft pink and gold, small flowers', text: 'A & S', budget: 8000, photos: ['art:cake:4', 'art:cake:0'], details: 'Three tiers if possible. Some guests are nut-allergic.' } } })
  add({ n: 12, source: 'custom', status: 'quote_sent', fulfilment: 'delivery', day: 9, window: 'morning', name: 'Rajiv Mooneea', phone: '+230 5888 2121', email: 'rajiv@example.com', token: 'quotesent-demo-3n6b5wy1', hoursAgo: 30, items: [],
    log: [['Sabera', 'quote sent', 'Rs 4,500']],
    extra: {
      total: 4500,
      quote: { amount: 4500, note: 'Includes delivery to Port Louis. Hand-piped flowers.', expiry: addDays(today, 1), sentAt: now - 28 * HOUR },
      custom: { occasion: 'birthday', servings: '25', flavours: 'Chocolate', theme: 'Football, blue and white', text: 'Go Arjun!', photos: ['art:cake:5'], details: '' },
    } })

  const blocked = [
    { id: 'blk-1', from: addDays(today, 6), to: addDays(today, 6), reason: 'Family event', by: 'Sabera' },
    { id: 'blk-2', from: addDays(today, 11), to: addDays(today, 11), reason: 'Day off', by: 'Sabera' },
  ]

  const byPhone = new Map<string, Customer>()
  for (const o of orders) {
    const key = o.customer.phone.replace(/\D/g, '')
    if (!byPhone.has(key)) byPhone.set(key, { id: `c-${byPhone.size + 1}`, ...o.customer, lang: o.lang })
  }

  return {
    clockMs: 0, products, promotions: seedPromos(now), settings, orders, customers: [...byPhone.values()],
    admins: seedAdmins(), blocked, outbox: [], orderSeq: 13,
  }
}
