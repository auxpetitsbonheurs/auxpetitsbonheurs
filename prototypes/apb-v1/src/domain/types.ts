export type Lang = 'en' | 'fr'
export interface L { en: string; fr: string }

export type ProductType = 'cake' | 'cupcake' | 'dessert' | 'seasonal'
export type ProductStatus = 'available' | 'soldout' | 'hidden'
export type OptionKind = 'one' | 'several' | 'text' | 'quantity'
export type Allergen = 'gluten' | 'egg' | 'milk' | 'nuts' | 'soy'

export interface OptionChoice { id: string; name: L; price: number }
export interface OptionGroup {
  id: string
  name: L
  kind: OptionKind
  required: boolean
  charLimit?: number
  qtyMin?: number
  qtyMax?: number
  choices: OptionChoice[]
}
export interface Product {
  id: string
  type: ProductType
  name: L
  desc: L
  photos: string[]
  basePrice: number
  allergens: Allergen[]
  noticeDays?: number
  status: ProductStatus
  sort: number
  seasonStart?: string
  seasonEnd?: string
  groups: OptionGroup[]
}

export interface PromoItem { productId: string; kind: 'percent' | 'fixed'; value: number }
export interface Promotion {
  id: string
  title: L
  text: L
  startMs: number
  endMs: number
  active: boolean
  showBanner: boolean
  showCard: boolean
  link: { kind: 'none' | 'product' | 'category' | 'custom'; ref?: string }
  items: PromoItem[]
}

export interface Selection {
  choices: Record<string, string[]>
  texts: Record<string, string>
  qty: number
}

export interface OrderItemOption { group: L; choice: L; price: number; kind: OptionKind }
export interface OrderItem {
  id: string
  productId?: string
  name: L
  options: OrderItemOption[]
  message?: string
  qty: number
  basePrice: number
  originalBase: number
  promoId?: string
  unit: number
  lineTotal: number
}
export type PricedLine = Omit<OrderItem, 'id'>

export type Status =
  | 'pending' | 'quote_needed' | 'quote_sent' | 'approved' | 'preparing'
  | 'ready' | 'out' | 'completed' | 'declined' | 'cancelled' | 'closed'
export type Source = 'website' | 'custom' | 'manual'
export type Fulfilment = 'delivery' | 'pickup'
export type ActorKind = 'admin' | 'customer' | 'system'
export interface Actor { kind: ActorKind; name: string }

export interface OrderEvent { at: number; by: Actor; what: string; details?: string }
export interface Quote { amount: number; note: string; expiry: string; sentAt: number }
export interface CustomRequest {
  occasion: string
  servings: string
  flavours: string
  theme: string
  text: string
  budget?: number
  photos: string[]
  details: string
}
export interface OrderCustomer { name: string; phone: string; email: string }
export interface Order {
  id: string
  number: string
  source: Source
  status: Status
  customer: OrderCustomer
  fulfilment: Fulfilment
  address: string
  landmark: string
  date: string
  window: string
  items: OrderItem[]
  deliveryFee: number
  total: number
  paid: boolean
  customerNote: string
  adminNote: string
  declineReason?: string
  lang: Lang
  token: string
  createdAt: number
  version: number
  events: OrderEvent[]
  quote?: Quote
  custom?: CustomRequest
  submitKey?: string
}

export interface Customer { id: string; name: string; phone: string; email: string; lang: Lang; note?: string }
export type Role = 'owner' | 'admin'
export interface Admin {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  invited: boolean
  lang: Lang
  alerts: { push: boolean; email: boolean }
  lastSignIn: number | null
}
export interface BlockedDate { id: string; from: string; to: string; reason: string; by: string }

export interface TimeWindow { id: string; name: L; from: string; to: string }
export type TemplateKey = 'approved' | 'ready' | 'onway' | 'payment' | 'blank'
export interface Settings {
  defaultNotice: number
  closedDays: number[]
  windows: TimeWindow[]
  deliveryFee: number
  quoteValidity: number
  prefix: string
  juice: string
  pickupAddress: string
  mapLink: string
  whatsapp: string
  phone: string
  email: string
  instagram: string
  messageLimit: number
  featured: string[]
  templates: Record<TemplateKey, L>
  about: L
  faq: L
  policies: L
  tagline: L
}

export interface OutboxItem {
  id: string
  at: number
  channel: 'email' | 'push'
  to: string
  subject: string
  body: string
  lang: Lang
  orderId?: string
}

export interface GalleryPhoto { id: string; art: string; occasion: string; caption: L }

export interface Db {
  clockMs: number
  products: Product[]
  promotions: Promotion[]
  settings: Settings
  orders: Order[]
  customers: Customer[]
  admins: Admin[]
  blocked: BlockedDate[]
  outbox: OutboxItem[]
  orderSeq: number
}
