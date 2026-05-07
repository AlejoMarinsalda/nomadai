import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { googleLogin, guestLogin } from '../lib/api'

const CLIENT_ID = '496610892208-7ejbi9l76b71hjdd28lghc7pruu9tr1t.apps.googleusercontent.com'

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
          { theme: 'filled_black', size: 'large', shape: 'rectangular' }
        )
      } else {
        setTimeout(tryInit, 100)
      }
    }
    tryInit()
  }, [handleGoogleResponse])

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-zinc-950">
      {/* Header */}
      <header className="flex-shrink-0 h-14 flex items-center px-6 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌍</span>
          <span className="font-bold text-sm gradient-text">NomadAI</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(16,185,129,0.07) 0%, rgba(99,102,241,0.04) 50%, transparent 100%)' }}
        />

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">

          {/* Hero */}
          <div className="text-center">
            <span
              className="text-5xl block mb-4"
              style={{ filter: 'drop-shadow(0 0 20px rgba(16,185,129,0.28))' }}
            >
              🌍
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight gradient-text">NomadAI</h1>
            <p className="mt-2.5 text-sm text-zinc-500 leading-relaxed">
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
              <div key={key} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
                <span className="text-base flex-shrink-0">{icon}</span>
                <span className="text-xs text-zinc-400 leading-relaxed">{t(key)}</span>
              </div>
            ))}
          </div>

          {/* Auth options */}
          <div className="flex flex-col items-center gap-3 w-full">
            <div id="google-signin-btn" />
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-600">{t('login.or')}</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
            <button
              onClick={handleGuestLogin}
              disabled={guestLoading}
              className="w-full py-2.5 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
            >
              {guestLoading ? t('login.guest_loading') : t('login.guest_button')}
            </button>
            <p className="text-xs text-zinc-600">{t('login.google_note')}</p>
          </div>

        </div>
      </div>
    </div>
  )
}
