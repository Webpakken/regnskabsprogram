import { Navigate, Outlet } from 'react-router-dom'
import { LoadingCentered } from '@/components/LoadingIndicator'
import { useApp } from '@/context/AppProvider'

/**
 * Spærrer ruter for revisorer, der kun har læseadgang — fx virksomhedens
 * indstillinger. Sender dem tilbage til Indstillinger-menuen, hvor de kan
 * hente regnskabsmaterialet.
 */
export function BlockAccountant() {
  const { currentRole, loading } = useApp()
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
  if (currentRole === 'accountant') {
    return <Navigate to="/app/settings" replace />
  }
  return <Outlet />
}
