import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingCentered } from '@/components/LoadingIndicator'
import { useApp } from '@/context/AppProvider'

export function ProtectedRoute() {
  const { session, loading, aalNeedsUpgrade } = useApp()
  const location = useLocation()
  if (loading) {
    return (
      <LoadingCentered
        minHeight="min-h-screen"
        className="bg-slate-50"
        caption="Indlæser…"
        srLabel="Indlæser"
      />
    )
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (aalNeedsUpgrade && location.pathname !== '/login/2fa') {
    return <Navigate to="/login/2fa" replace />
  }
  return <Outlet />
}
