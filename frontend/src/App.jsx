import { useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowLeftRight, PiggyBank, Wallet, Tag, Target, LogOut, BookOpen, Bell, Users, Settings as SettingsIcon } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Assets from './pages/Assets'
import Categories from './pages/Categories'
import Goals from './pages/Goals'
import Notifications from './pages/Notifications'
import SharedOverview from './pages/SharedOverview'
import Settings from './pages/Settings'
import UserGuides, { WelcomeGuideCard } from './pages/UserGuides'
import { auth, AUTH_TOKEN_STORAGE_KEY, notifications, users } from './utils/api'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transaksjoner', icon: ArrowLeftRight },
  { to: '/budget', label: 'Budsjett', icon: Wallet },
  { to: '/goals', label: 'Mål', icon: Target },
  { to: '/assets', label: 'Formue', icon: PiggyBank },
  { to: '/categories', label: 'Kategorier', icon: Tag },
  { to: '/shared', label: 'Mellom oss', icon: Users },
  { to: '/notifications', label: 'Varsler', icon: Bell },
  { to: '/settings', label: 'Innstillinger', icon: SettingsIcon },
  { to: '/guides', label: 'User guides', icon: BookOpen },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [completingOnboarding, setCompletingOnboarding] = useState(false)
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0)

  useEffect(() => {
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    if (!token) {
      setLoadingAuth(false)
      return
    }
    auth.me()
      .then(setUser)
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
        setUser(null)
      })
      .finally(() => setLoadingAuth(false))
  }, [])

  useEffect(() => {
    if (!user) return
    notifications.count()
      .then((result) => setPendingNotificationCount(result.pending_count || 0))
      .catch(() => setPendingNotificationCount(0))
  }, [user])

  async function handleLogout() {
    try {
      await auth.logout()
    } catch {
      // Ignore logout failures and clear local auth state anyway.
    } finally {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      setUser(null)
    }
  }

  async function handleCompleteOnboarding() {
    setCompletingOnboarding(true)
    try {
      await users.completeOnboarding()
      setUser(current => ({ ...current, onboarding_completed: true }))
    } finally {
      setCompletingOnboarding(false)
    }
  }

  function handleSessionEnded() {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setUser(null)
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Laster innlogging...
      </div>
    )
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />
  }

  return (
    <div className="flex h-screen bg-gray-50 relative">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col py-6 px-3 shrink-0">
        <div className="flex items-center gap-2 px-3 mb-8">
          <span className="text-2xl">💰</span>
          <div>
            <span className="block text-lg font-bold text-gray-800">Sparebuddy</span>
            <span className="block text-xs text-gray-400">Logget inn som {user.name}</span>
          </div>
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
              <span className="flex-1">{label}</span>
              {to === '/notifications' && pendingNotificationCount > 0 && (
                <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">
                  {pendingNotificationCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut size={16} />
          Logg ut
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/shared" element={<SharedOverview />} />
          <Route path="/notifications" element={<Notifications onCountChange={setPendingNotificationCount} />} />
          <Route path="/settings" element={<Settings user={user} onUserUpdated={setUser} onDeactivated={handleSessionEnded} />} />
          <Route path="/guides" element={<UserGuides />} />
        </Routes>
      </main>

      {!user.onboarding_completed && (
        <div className="absolute inset-0 z-50 bg-gray-950/45 backdrop-blur-sm flex items-center justify-center p-6">
          <WelcomeGuideCard onComplete={handleCompleteOnboarding} loading={completingOnboarding} />
        </div>
      )}
    </div>
  )
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', invite_token: '' })
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    try {
      const response = mode === 'login'
        ? await auth.login({ email: form.email, password: form.password })
        : await auth.register(form)

      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token)
      onAuthenticated(response.user)
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke logge inn.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dcfce7,_#f8fafc_45%)] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 shadow-xl rounded-3xl p-8">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-green-600 mb-2">Sparebuddy</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {mode === 'login' ? 'Logg inn' : 'Opprett bruker'}
          </h1>
          <p className="text-sm text-gray-500">
            {mode === 'login'
              ? 'Logg inn for å se din egen økonomi.'
              : 'Bruk invitasjonskoden fra familieadministratoren for å opprette brukeren din.'}
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Logg inn
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              mode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Opprett bruker
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Navn</label>
              <input
                required
                type="text"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                value={form.name}
                onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
              />
            </div>
          )}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invitasjonskode</label>
              <input
                required
                type="text"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                value={form.invite_token}
                onChange={e => setForm(current => ({ ...current, invite_token: e.target.value }))}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
            <input
              required
              type="email"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              value={form.email}
              onChange={e => setForm(current => ({ ...current, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Passord</label>
            <input
              required
              type="password"
              minLength={8}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              value={form.password}
              onChange={e => setForm(current => ({ ...current, password: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {submitting
              ? 'Jobber...'
              : mode === 'login'
                ? 'Logg inn'
                : 'Opprett bruker'}
          </button>
        </form>
      </div>
    </div>
  )
}
