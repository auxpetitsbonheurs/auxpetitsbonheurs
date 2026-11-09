import type { Admin, L, Lang, Order, Settings } from '../domain/types'
import type { EmailKind } from '../domain/status'
import { formatRs } from '../domain/money'
import { fmtDate } from '../domain/time'

const SUBJECT: Record<EmailKind, L> = {
  received: { en: 'We received your order {n}', fr: 'Nous avons reçu votre commande {n}' },
  request_received: { en: 'We received your cake request {n}', fr: 'Nous avons reçu votre demande de gâteau {n}' },
  quote: { en: 'Your quote for {n}', fr: 'Votre devis pour {n}' },
  confirmed: { en: 'Order {n} is confirmed', fr: 'Commande {n} confirmée' },
  declined: { en: 'Order {n} could not be accepted', fr: 'Commande {n} refusée' },
  request_declined: { en: 'About your request {n}', fr: 'À propos de votre demande {n}' },
  cancelled: { en: 'Order {n} is cancelled', fr: 'Commande {n} annulée' },
  quote_closed: { en: 'Your quote {n} is closed', fr: 'Votre devis {n} est clos' },
  ready: { en: 'Order {n} is ready', fr: 'Commande {n} prête' },
  onway: { en: 'Order {n} is on its way', fr: 'Commande {n} en route' },
  thanks: { en: 'Thank you for your order {n}', fr: 'Merci pour votre commande {n}' },
  invitation: { en: 'You are invited to the Aux petits bonheurs admin', fr: 'Invitation à l\'administration Aux petits bonheurs' },
}

const INTRO: Record<EmailKind, L> = {
  received: { en: 'Thank you! Your order is NOT confirmed yet: the bakery will review it and email you soon.', fr: 'Merci ! Votre commande n\'est PAS encore confirmée : la pâtisserie va l\'examiner et vous écrire bientôt.' },
  request_received: { en: 'Thank you! We received your custom cake request and will send you a quote.', fr: 'Merci ! Nous avons reçu votre demande de gâteau sur mesure et vous enverrons un devis.' },
  quote: { en: 'Your quote is ready. Please accept or decline before it expires.', fr: 'Votre devis est prêt. Merci de l\'accepter ou le refuser avant son expiration.' },
  confirmed: { en: 'Good news, your order is confirmed!', fr: 'Bonne nouvelle, votre commande est confirmée !' },
  declined: { en: 'Sorry, we cannot accept this order.', fr: 'Désolé, nous ne pouvons pas accepter cette commande.' },
  request_declined: { en: 'Sorry, we cannot take on this request.', fr: 'Désolé, nous ne pouvons pas réaliser cette demande.' },
  cancelled: { en: 'Your order has been cancelled.', fr: 'Votre commande a été annulée.' },
  quote_closed: { en: 'Your quote has been closed (declined or expired).', fr: 'Votre devis a été clos (refusé ou expiré).' },
  ready: { en: 'Your order is ready!', fr: 'Votre commande est prête !' },
  onway: { en: 'Your order is on its way!', fr: 'Votre commande est en route !' },
  thanks: { en: 'Thank you for choosing Aux petits bonheurs. We hope you enjoyed it!', fr: 'Merci d\'avoir choisi Aux petits bonheurs. Nous espérons que vous vous êtes régalés !' },
  invitation: { en: 'You have been invited as an admin.', fr: 'Vous avez été invité comme administrateur.' },
}

const origin = (): string => (typeof window === 'undefined' ? '' : window.location.origin)
export const trackingUrl = (o: Pick<Order, 'token'>): string => `${origin()}/order/${o.token}`

function summary(o: Order, s: Settings, lang: Lang): string[] {
  const L2 = lang === 'fr'
  const lines = o.items.map((it) => {
    const opts = [...it.options.map((x) => x.choice[lang] || x.choice.en), it.message ? `"${it.message}"` : ''].filter(Boolean).join(', ')
    return `- ${it.qty} x ${it.name[lang] || it.name.en}${opts ? ` (${opts})` : ''}: ${formatRs(it.lineTotal)}`
  })
  const win = s.windows.find((w) => w.id === o.window)
  return [
    `${L2 ? 'Commande' : 'Order'}: ${o.number}`,
    ...lines,
    `${L2 ? 'Date' : 'Date'}: ${fmtDate(o.date, lang, true)}${win ? `, ${win.name[lang]} ${win.from}-${win.to}` : ''}`,
    `${L2 ? (o.fulfilment === 'pickup' ? 'Retrait' : 'Livraison') : o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}`,
    `Total: ${formatRs(o.total)}`,
  ]
}

export interface BuiltEmail { subject: string; body: string }

export function buildEmail(kind: EmailKind, o: Order, s: Settings, lang: Lang): BuiltEmail {
  const fr = lang === 'fr'
  const win = s.windows.find((w) => w.id === o.window)
  const lines: string[] = [fr ? `Bonjour ${o.customer.name},` : `Hello ${o.customer.name},`, '', INTRO[kind][lang], '']
  const sum = summary(o, s, lang)
  const track = `${fr ? 'Suivre votre commande' : 'Track your order'}: ${trackingUrl(o)}`
  switch (kind) {
    case 'received':
    case 'request_received':
      lines.push(...sum, '', track)
      break
    case 'quote':
      lines.push(
        `${fr ? 'Montant' : 'Amount'}: ${formatRs(o.quote?.amount ?? 0)}`,
        o.quote?.note ? `${fr ? 'Note' : 'Note'}: ${o.quote.note}` : '',
        `${fr ? 'Valable jusqu\'au' : 'Valid until'}: ${o.quote ? fmtDate(o.quote.expiry, lang, true) : ''}`,
        '', `[${fr ? 'Accepter' : 'Accept'}] [${fr ? 'Refuser' : 'Decline'}]  ${trackingUrl(o)}`,
      )
      break
    case 'confirmed':
      lines.push(...sum, '', fr ? `Paiement : Juice au ${s.juice} ou espèces.` : `Payment: Juice on ${s.juice} or cash.`)
      lines.push(o.fulfilment === 'pickup'
        ? `${fr ? 'Retrait à' : 'Pickup at'}: ${s.pickupAddress}`
        : `${fr ? 'Livraison à' : 'Delivery to'}: ${o.address} (${o.landmark})`, '', track)
      break
    case 'declined':
    case 'request_declined':
      lines.push(o.declineReason ? `${fr ? 'Raison' : 'Reason'}: ${o.declineReason}` : '', `${fr ? 'Voir le menu' : 'See the menu'}: ${origin()}/menu`)
      break
    case 'cancelled':
      lines.push(`${fr ? 'Commande' : 'Order'}: ${o.number}`)
      break
    case 'quote_closed':
      lines.push(`${fr ? 'Nouvelle demande' : 'Send a new request'}: ${origin()}/custom`)
      break
    case 'ready':
      lines.push(`${fr ? 'Retrait à' : 'Pickup at'}: ${s.pickupAddress}`, win ? `${win.name[lang]} ${win.from}-${win.to}` : '', '', track)
      break
    case 'onway':
      lines.push(win ? `${fr ? 'Créneau' : 'Window'}: ${win.name[lang]} ${win.from}-${win.to}` : '', '', track)
      break
    case 'thanks':
      lines.push(`${fr ? 'Commander à nouveau' : 'Order again'}: ${origin()}/menu`, `Instagram: ${s.instagram}`)
      break
    case 'invitation':
      break
  }
  return {
    subject: SUBJECT[kind][lang].replace('{n}', o.number),
    body: lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'),
  }
}

export function buildInvitation(admin: Admin, lang: Lang): BuiltEmail {
  const fr = lang === 'fr'
  return {
    subject: SUBJECT.invitation[lang],
    body: [
      fr ? `Bonjour ${admin.name},` : `Hello ${admin.name},`, '', INTRO.invitation[lang],
      `${fr ? 'Rôle' : 'Role'}: ${admin.role}`,
      `${fr ? 'Définir votre mot de passe (valable 7 jours)' : 'Set your password (valid 7 days)'}: ${origin()}/admin?invite=${admin.id}`,
    ].join('\n'),
  }
}
