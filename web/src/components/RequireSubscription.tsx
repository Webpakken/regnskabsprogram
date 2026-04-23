import { Navigate, Outlet } from 'react-router-dom'
import { LoadingCentered } from '@/components/LoadingIndicator'
import { useApp, subscriptionOk } from '@/context/AppProvider'

export function RequireSubscription() {
  const { currentCompany, subscription, loading } = useApp()
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
  if (!currentCompany) {
    return <Navigate to="/onboarding" replace />
  }
  if (!subscriptionOk(subscription)) {
    return <Navigate to="/app/dashboard" replace />
  }
  return <Outlet />
}
