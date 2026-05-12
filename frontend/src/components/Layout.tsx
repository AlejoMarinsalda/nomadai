import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { deleteReport, getReports } from '../lib/api'
import LogoComponent, { CompassIcon } from './Logo'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = '#F2EDE4'
const ACCENT = '#C84B1A'
const DARK   = '#1C1917'
const BORDER = '#E7E0D7'
const MUTED  = '#9E9186'

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChatIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function HistoryIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

function UserIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function LogoutIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function Logo() {
  return <LogoComponent size={28} />
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  session_id: string
  created_at: string
  destinations: { city: string; country: string }[]
  report_text: string
  result_json: import('../lib/api').ResultData | null
}

const BOTTOM_NAV_KEYS = [
  { to: '/chat',    Icon: ChatIcon,    labelKey: 'layout.chat' },
  { to: '/history', Icon: HistoryIcon, labelKey: 'layout.history' },
  { to: '/profile', Icon: UserIcon,    labelKey: 'layout.profile' },
]

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { userId, userName, userPicture, credential, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const activeSession =
    searchParams.get('session') ||
    location.pathname.match(/\/(?:history|results)\/([^/?]+)/)?.[1] ||
    null

  const [sessions, setSessions] = useState<Session[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

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
          result_json: r.result_json ?? null,
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

  async function handleDeleteSession(e: React.MouseEvent, s: Session) {
    e.stopPropagation()
    if (!userId || !credential) return
    setDeleting(s.session_id)
    try {
      await deleteReport(userId, credential, s.created_at)
      setSessions(prev => prev.filter(r => r.session_id !== s.session_id))
      if (activeSession === s.session_id) navigate('/history', { replace: true })
    } catch {
      // silent
    } finally {
      setDeleting(null)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const avatar = userPicture
    ? <img src={userPicture} alt="avatar" className="w-7 h-7 rounded-full object-cover" style={{ border: `1.5px solid ${BORDER}` }} />
    : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
           style={{ background: BORDER, color: DARK }}>
        {(userName || '?')[0].toUpperCase()}
      </div>

  return (
    <div className="h-dvh flex overflow-hidden" style={{ background: BG }}>

      {/* ── Sidebar (desktop md+) ─────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col w-52 flex-shrink-0"
        style={{ borderRight: `1px solid ${BORDER}`, background: BG }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <Logo />
        </div>

        {/* Nav */}
        <div className="flex-1 flex flex-col overflow-hidden py-3">

          {/* Nueva búsqueda */}
          <div className="px-3 mb-2">
            <button
              onClick={() => navigate(sessions.length > 0 ? '/onboarding?quick=1' : '/onboarding')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ color: ACCENT }}
              onMouseEnter={e => (e.currentTarget.style.background = '#EDE6DA')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {t('layout.new_search')}
            </button>
          </div>

          {/* Session list */}
          {sessions.length > 0 && (
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 flex flex-col gap-0.5">
              {sessions.map(s => {
                const label = s.destinations.map(d => d.city).join(', ') || t('layout.new_search')
                const isActive = activeSession === s.session_id
                const isDel = deleting === s.session_id
                return (
                  <div
                    key={s.session_id}
                    className="group w-full flex items-center rounded-lg text-xs transition-all"
                    style={{
                      background:  isActive ? DARK : 'transparent',
                      color:       isActive ? '#FFFFFF' : MUTED,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#EDE6DA'; e.currentTarget.style.color = DARK }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED } }}
                  >
                    <button
                      onClick={() => s.result_json
                        ? navigate(`/results/${s.session_id}`, { state: { result: s.result_json } })
                        : navigate(`/history/${s.session_id}`, { state: { report: s } })
                      }
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0"
                    >
                      <CompassIcon size={12} />
                      <span className="truncate">{label}</span>
                    </button>
                    <button
                      onClick={e => handleDeleteSession(e, s)}
                      disabled={isDel}
                      className="flex-shrink-0 pr-2 pl-1 py-2 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
                      style={{ color: MUTED }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = MUTED}
                    >
                      {isDel
                        ? <span className="text-[10px]">…</span>
                        : <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24"
                               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          </svg>
                      }
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Secondary nav */}
          <div className={`px-3 flex flex-col gap-0.5 ${sessions.length > 0 ? 'pt-2 mt-2' : 'mt-auto'}`}
               style={sessions.length > 0 ? { borderTop: `1px solid ${BORDER}` } : {}}>
            {[
              { to: '/history', Icon: HistoryIcon, key: 'layout.history' },
              { to: '/profile', Icon: UserIcon,    key: 'layout.profile' },
            ].map(({ to, Icon, key }) => (
              <NavLink key={to} to={to}>
                {({ isActive }) => (
                  <div
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: isActive ? DARK : 'transparent',
                      color:      isActive ? '#FFFFFF' : MUTED,
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    {t(key)}
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* User */}
        <div className="px-3 pb-3 pt-2 flex flex-col gap-0.5 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2.5 px-3 py-2">
            {avatar}
            <span className="text-xs truncate" style={{ color: DARK, fontWeight: 500 }}>{userName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs w-full transition-colors"
            style={{ color: MUTED }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EDE6DA'; e.currentTarget.style.color = DARK }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED }}
          >
            <LogoutIcon className="w-4 h-4" />
            {t('layout.logout')}
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile header */}
        <header
          className="md:hidden flex-shrink-0 h-12 flex items-center justify-between px-4"
          style={{ borderBottom: `1px solid ${BORDER}`, background: BG }}
        >
          <Logo />
          <div className="flex items-center gap-2">
            {avatar}
            <button
              onClick={handleLogout}
              className="text-xs px-2 py-1 rounded-md transition-colors"
              style={{ color: MUTED, border: `1px solid ${BORDER}` }}
            >
              {t('layout.logout')}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="md:hidden flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}`, background: BG }}>
          <div className="flex">
            {BOTTOM_NAV_KEYS.map(({ to, Icon, labelKey }) => (
              <NavLink
                key={to}
                to={to}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
              >
                {({ isActive }) => (
                  <>
                    <Icon className="w-5 h-5" style={{ color: isActive ? ACCENT : MUTED }} />
                    <span style={{ color: isActive ? ACCENT : MUTED }}>{t(labelKey)}</span>
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
