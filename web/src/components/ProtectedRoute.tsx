import { Navigate, Outlet } from 'react-router-dom'
import { LoadingCentered } from '@/components/LoadingIndicator'
import { useApp } from '@/context/AppProvider'

export function ProtectedRoute() {
  const { session, loading } = useApp()
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
  return <Outlet />
}
