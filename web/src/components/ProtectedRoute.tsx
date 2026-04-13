import { Navigate, Outlet } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'

export function ProtectedRoute() {
  const { session, loading } = useApp()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Indlæser…
      </div>
    )
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
