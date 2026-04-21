import { Navigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { PlatformShell } from '@/components/PlatformShell'

/**
 * Platform-ruter: én layout uden ekstra pathless Route, så Outlet i PlatformShell
 * matcher korrekt under React Router 7 (undgår tom/hvid hovedindhold).
 */
export function ProtectedPlatformRoute() {
  const { loading, platformRole } = useApp()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Indlæser…
      </div>
    )
  }
  if (!platformRole) {
    return <Navigate to="/home" replace />
  }
  return <PlatformShell />
}
