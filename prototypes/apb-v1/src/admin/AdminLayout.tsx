import { Link, NavLink, Outlet } from 'react-router-dom'
import { useSession } from '../mocks/store'
import { btn } from '../ui/ui'

const TABS: [string, string, boolean][] = [
  ['/admin', 'Today', true], ['/admin/orders', 'Orders', false], ['/admin/calendar', 'Calendar', false],
  ['/admin/menu', 'Menu', false], ['/admin/more', 'More', false],
]

export function AdminLayout() {
  const { admin, isAdmin, deactivated } = useSession()
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="mb-2 text-2xl">{deactivated ? 'You have been signed out' : 'Admin area'}</h1>
        <p className="mb-5 text-ink-soft">
          {deactivated
            ? 'This admin account was deactivated by an Owner.'
            : 'This area is for the bakery team. A customer account cannot open it. In the prototype, use the toolbar (bottom right) to switch to Admin Sarah or Owner Sabera.'}
        </p>
        <Link to="/" className={btn('outline')}>Back to the shop</Link>
      </div>
    )
  }
  return (
    <div className="min-h-screen pb-36">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-honey-200 bg-cream/95 px-4 py-2 backdrop-blur">
        <p className="font-serif text-lg font-semibold text-honey-700">Admin</p>
        <p className="text-sm text-ink-soft">{admin?.name} · {admin?.role === 'owner' ? 'Owner' : 'Admin'}</p>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-4"><Outlet /></main>
      <nav aria-label="Admin" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-honey-200 bg-paper pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-h-14 items-center justify-center text-xs font-semibold ${isActive ? 'text-honey-700' : 'text-ink-soft'}`}>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** Owner-only screens: blocked for an Admin even when the address is typed in. */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { isOwner } = useSession()
  if (!isOwner) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-2 text-2xl">Owner only</h1>
        <p className="mb-4 text-ink-soft">Your role (Admin) cannot open this screen.</p>
        <Link to="/admin/more" className={btn('outline')}>Back to More</Link>
      </div>
    )
  }
  return <>{children}</>
}
