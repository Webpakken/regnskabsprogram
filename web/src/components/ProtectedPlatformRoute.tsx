import { Navigate } from 'react-router-dom'
import { LoadingCentered } from '@/components/LoadingIndicator'
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
      <LoadingCentered
        minHeight="min-h-screen"
        className="bg-slate-50"
        caption="Indlæser…"
        srLabel="Indlæser"
      />
    )
  }
  if (!platformRole) {
    return <Navigate to="/home" replace />
  }
  return <PlatformShell />
}
