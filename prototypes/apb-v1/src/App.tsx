import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AdminLayout, OwnerOnly } from './admin/AdminLayout'
import { AdminMenu, ProductEditor } from './admin/AdminMenu'
import { Calendar } from './admin/Calendar'
import { ManualOrder } from './admin/ManualOrder'
import { More, Customers, Profile, SettingsScreen, Team } from './admin/More'
import { OrderDetail } from './admin/OrderDetail'
import { Orders } from './admin/Orders'
import { PromoEditor, Promotions } from './admin/Promotions'
import { Today } from './admin/Today'
import { Basket } from './customer/Basket'
import { Confirmation } from './customer/Confirmation'
import { CustomRequest } from './customer/CustomRequest'
import { About, Contact, Gallery } from './customer/InfoPages'
import { CustomerLayout } from './customer/Layout'
import { Home } from './customer/Home'
import { Menu } from './customer/Menu'
import { ProductPage } from './customer/ProductPage'
import { Tracking } from './customer/Tracking'
import { useI18n } from './i18n'
import { Toolbar } from './proto/Toolbar'

function Effects() {
  const { lang } = useI18n()
  const { pathname } = useLocation()
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  const owner = (el: JSX.Element) => <OwnerOnly>{el}</OwnerOnly>
  return (
    <BrowserRouter>
      <Effects />
      <Routes>
        <Route element={<CustomerLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/basket" element={<Basket />} />
          <Route path="/confirmation/:token" element={<Confirmation />} />
          <Route path="/order/:token" element={<Tracking />} />
          <Route path="/custom" element={<CustomRequest />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Today />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/new" element={<ManualOrder />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="menu" element={<AdminMenu />} />
          <Route path="menu/:id" element={<ProductEditor />} />
          <Route path="promotions" element={<Promotions />} />
          <Route path="promotions/:id" element={<PromoEditor />} />
          <Route path="more" element={<More />} />
          <Route path="customers" element={<Customers />} />
          <Route path="profile" element={<Profile />} />
          <Route path="team" element={owner(<Team />)} />
          <Route path="more/team" element={owner(<Team />)} />
          <Route path="more/availability" element={owner(<SettingsScreen />)} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
          <Route path="availability" element={owner(<SettingsScreen />)} />
        </Route>
      </Routes>
      <Toolbar />
    </BrowserRouter>
  )
}
