import { Navigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'

export function HomeRedirect() {
  const { loading, companies } = useApp()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Indlæser…
      </div>
    )
  }
  if (companies.length === 0) {
    return <Navigate to="/onboarding" replace />
  }
  return <Navigate to="/app/dashboard" replace />
}
