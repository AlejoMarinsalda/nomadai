import { createContext, useCallback, useContext, useEffect, useState } from 'react'

interface AuthState {
  userId: string | null
  userName: string | null
  userPicture: string | null
  credential: string | null
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean
  login: (data: { user_id: string; name: string; picture: string }, credential: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const LS_KEYS = ['nomadai_user_id', 'nomadai_user_name', 'nomadai_user_picture', 'nomadai_credential']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    userId: null, userName: null, userPicture: null, credential: null,
  })

  useEffect(() => {
    const userId     = localStorage.getItem('nomadai_user_id')
    const userName   = localStorage.getItem('nomadai_user_name')
    const userPicture = localStorage.getItem('nomadai_user_picture')
    const credential = localStorage.getItem('nomadai_credential')
    if (userId && userName && credential) {
      setAuth({ userId, userName, userPicture, credential })
    }
  }, [])

  const login = useCallback((data: { user_id: string; name: string; picture: string }, credential: string) => {
    localStorage.setItem('nomadai_user_id', data.user_id)
    localStorage.setItem('nomadai_user_name', data.name)
    localStorage.setItem('nomadai_user_picture', data.picture || '')
    localStorage.setItem('nomadai_credential', credential)
    setAuth({ userId: data.user_id, userName: data.name, userPicture: data.picture, credential })
  }, [])

  const logout = useCallback(() => {
    LS_KEYS.forEach(k => localStorage.removeItem(k))
    setAuth({ userId: null, userName: null, userPicture: null, credential: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).google?.accounts?.id?.disableAutoSelect()
  }, [])

  return (
    <AuthContext.Provider value={{
      ...auth,
      isAuthenticated: !!auth.userId && !!auth.credential,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
