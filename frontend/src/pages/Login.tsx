import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { googleLogin, guestLogin } from '../lib/api'
import Logo, { CompassIcon } from '../components/Logo'

const CLIENT_ID = '496610892208-7ejbi9l76b71hjdd28lghc7pruu9tr1t.apps.googleusercontent.com'

const BG     = '#F2EDE4'
const ACCENT = '#C84B1A'
const DARK   = '#1C1917'
const BORDER = '#E7E0D7'
const MUTED  = '#9E9186'

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [guestLoading, setGuestLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/chat', { replace: true })
  }, [isAuthenticated, navigate])

  const handleGuestLogin = useCallback(async () => {
    setGuestLoading(true)
    try {
      const data = await guestLogin()
      login(data, data.user_id)
      navigate('/chat', { replace: true })
    } catch {
      alert(t('login.error_guest'))
    } finally {
      setGuestLoading(false)
    }
  }, [login, navigate, t])

  const handleGoogleResponse = useCallback(async (response: { credential: string }) => {
    try {
      const data = await googleLogin(response.credential)
      login(data, response.credential)
      navigate('/chat', { replace: true })
    } catch {
      alert(t('login.error_google'))
    }
  }, [login, navigate, t])

  useEffect(() => {
    function tryInit() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google
      if (google?.accounts?.id) {
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleGoogleResponse })
        google.accounts.id.renderButton(
          document.getElementById('google-signin-btn'),
          { theme: 'outline', size: 'large', shape: 'rectangular' }
        )
      } else {
        setTimeout(tryInit, 100)
      }
    }
    tryInit()
  }, [handleGoogleResponse])

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: BG }}>

      {/* Header */}
      <header className="flex-shrink-0 h-14 flex items-center px-6" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <Logo size={28} />
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <div className="w-full max-w-sm flex flex-col items-center gap-8">

          {/* Hero */}
          <div className="text-center">
            <div className="flex justify-center mb-4"><CompassIcon size={72} /></div>
            <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '3.5rem', fontWeight: 700, color: DARK, letterSpacing: '-0.02em', lineHeight: 1 }}>
              nomadai
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: MUTED }}>
              {t('login.subtitle')}
            </p>
          </div>

          {/* Feature list */}
          <div className="w-full flex flex-col gap-2">
            {[
              { icon: '🎯', key: 'login.feature1' },
              { icon: '🛂', key: 'login.feature2' },
              { icon: '🏠', key: 'login.feature3' },
            ].map(({ icon, key }) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                style={{ background: '#FFFFFF', border: `1px solid ${BORDER}` }}
              >
                <span className="text-base flex-shrink-0">{icon}</span>
                <span className="text-xs leading-relaxed" style={{ color: '#3C3530' }}>{t(key)}</span>
              </div>
            ))}
          </div>

          {/* Auth options */}
          <div className="flex flex-col items-center gap-3 w-full">
            <div id="google-signin-btn" className="w-full" />

            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px" style={{ background: BORDER }} />
              <span className="text-xs" style={{ color: MUTED }}>{t('login.or')}</span>
              <div className="flex-1 h-px" style={{ background: BORDER }} />
            </div>

            <button
              onClick={handleGuestLogin}
              disabled={guestLoading}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
              style={{ border: `1px solid ${BORDER}`, color: MUTED, background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#EDE6DA'; e.currentTarget.style.color = DARK }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED }}
            >
              {guestLoading ? t('login.guest_loading') : t('login.guest_button')}
            </button>

            <p className="text-xs" style={{ color: MUTED }}>{t('login.google_note')}</p>
          </div>

        </div>
      </div>
    </div>
  )
}
