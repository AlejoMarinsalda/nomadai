import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getReports } from '../lib/api'

// ── Icons ────────────────────────────────────────────────────────────────────

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Session {
  session_id: string
  created_at: string
  destinations: { city: string; country: string }[]
  report_text: string
}

// ── Bottom nav items (mobile) ─────────────────────────────────────────────────

const BOTTOM_NAV = [
  { to: '/chat',    Icon: ChatIcon,    label: 'Chat' },
  { to: '/history', Icon: HistoryIcon, label: 'Historial' },
  { to: '/profile', Icon: UserIcon,    label: 'Perfil' },
]

// ── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { userId, userName, userPicture, credential, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSession = searchParams.get('session')
  const [sessions, setSessions] = useState<Session[]>([])

  const isGuest = userId?.startsWith('guest_') ?? false

  function fetchSessions() {
    if (!userId || !credential || isGuest) return
    getReports(userId, credential)
      .then(data => {
        const valid = data.reports.filter(r => r.session_id)
        setSessions(valid.map(r => ({
          session_id: r.session_id,
          created_at: r.created_at,
          destinations: r.destinations,
          report_text: r.report_text,
        })))
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchSessions()
    window.addEventListener('nomadai:newreport', fetchSessions)
    return () => window.removeEventListener('nomadai:newreport', fetchSessions)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, credential])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const avatar = userPicture
    ? <img src={userPicture} alt="avatar" className="w-7 h-7 rounded-full border border-zinc-700 object-cover" />
    : <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 font-medium">
        {(userName || '?')[0].toUpperCase()}
      </div>

  return (
    <div className="h-dvh flex overflow-hidden bg-zinc-950">

      {/* ── Sidebar (desktop md+) ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-52 border-r border-zinc-800/60 flex-shrink-0">

        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-zinc-800/60 flex-shrink-0">
          <span className="text-lg">🌍</span>
          <span className="font-bold text-sm gradient-text">NomadAI</span>
        </div>

        {/* Searches section */}
        <div className="flex-1 flex flex-col overflow-hidden py-2">

          {/* Nueva búsqueda */}
          <div className="px-2 mb-1">
            <button
              onClick={() => navigate('/chat')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-emerald-400 hover:bg-zinc-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nueva búsqueda
            </button>
          </div>

          {/* Session list */}
          {sessions.length > 0 && (
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 flex flex-col gap-0.5">
              {sessions.map(s => {
                const label = s.destinations.map(d => d.city).join(', ') || 'Búsqueda'
                const isActive = activeSession === s.session_id
                return (
                  <button
                    key={s.session_id}
                    onClick={() => navigate(`/chat?session=${s.session_id}`, { state: { report: { report_text: s.report_text } } })}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors
                      ${isActive
                        ? 'bg-zinc-800 text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                  >
                    <span className="flex-shrink-0">🗺️</span>
                    <span className="truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Divider + secondary nav */}
          <div className={`px-2 flex flex-col gap-0.5 ${sessions.length > 0 ? 'border-t border-zinc-800/60 pt-2 mt-2' : 'mt-auto'}`}>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                 ${isActive
                   ? 'bg-zinc-800 text-zinc-50'
                   : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`
              }
            >
              {({ isActive }) => (
                <>
                  <HistoryIcon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : ''}`} />
                  Historial
                </>
              )}
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                 ${isActive
                   ? 'bg-zinc-800 text-zinc-50'
                   : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`
              }
            >
              {({ isActive }) => (
                <>
                  <UserIcon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : ''}`} />
                  Perfil
                </>
              )}
            </NavLink>
          </div>
        </div>

        {/* User */}
        <div className="px-2 pb-3 pt-2 border-t border-zinc-800/60 flex flex-col gap-0.5 flex-shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2">
            {avatar}
            <span className="text-xs text-zinc-400 truncate">{userName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors w-full"
          >
            <LogoutIcon className="w-4 h-4" />
            Salir
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex-shrink-0 h-12 flex items-center justify-between px-4 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span>🌍</span>
            <span className="font-bold text-sm gradient-text">NomadAI</span>
          </div>
          <div className="flex items-center gap-2">
            {avatar}
            <button
              onClick={handleLogout}
              className="text-xs text-zinc-500 border border-zinc-800 rounded-md px-2 py-1 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="md:hidden flex-shrink-0 border-t border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm">
          <div className="flex">
            {BOTTOM_NAV.map(({ to, Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors
                   ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : ''}`} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
