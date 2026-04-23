import { Navigate } from 'react-router-dom'
import { LoadingCentered } from '@/components/LoadingIndicator'
import { useApp } from '@/context/AppProvider'

export function HomeRedirect() {
  const { loading, tenantCompanyCount, platformRole } = useApp()
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
  if (tenantCompanyCount === 0) {
    if (platformRole) {
      return <Navigate to="/platform/dashboard" replace />
    }
    return <Navigate to="/onboarding" replace />
  }
  return <Navigate to="/app/dashboard" replace />
}
