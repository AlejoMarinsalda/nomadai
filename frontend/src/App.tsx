import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Chat from './pages/Chat'
import History from './pages/History'
import ReportDetail from './pages/ReportDetail'
import ProfilePage from './pages/ProfilePage'
import Onboarding from './pages/Onboarding'
import Results from './pages/Results'
import DestinationDetail from './pages/DestinationDetail'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

const router = createHashRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth><Layout /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'onboarding',             element: <Onboarding /> },
      { path: 'results/:sessionId',           element: <Results /> },
      { path: 'results/:sessionId/:rank',     element: <DestinationDetail /> },
      { path: 'chat',                   element: <Chat /> },
      { path: 'history',                element: <History /> },
      { path: 'history/:sessionId',     element: <ReportDetail /> },
      { path: 'profile',                element: <ProfilePage /> },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
