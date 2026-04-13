import { Navigate, Outlet } from 'react-router-dom'
import { useApp, subscriptionOk } from '@/context/AppProvider'

export function RequireSubscription() {
  const { currentCompany, subscription, loading } = useApp()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Indlæser…
      </div>
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
