import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowLeftRight, PiggyBank, Wallet, Tag } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Assets from './pages/Assets'
import Categories from './pages/Categories'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transaksjoner', icon: ArrowLeftRight },
  { to: '/budget', label: 'Budsjett', icon: Wallet },
  { to: '/assets', label: 'Formue', icon: PiggyBank },
  { to: '/categories', label: 'Kategorier', icon: Tag },
]

export default function App() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-6 px-3 shrink-0">
        <div className="flex items-center gap-2 px-3 mb-8">
          <span className="text-2xl">💰</span>
          <span className="text-lg font-bold text-gray-800">Sparebuddy</span>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/categories" element={<Categories />} />
        </Routes>
      </main>
    </div>
  )
}
