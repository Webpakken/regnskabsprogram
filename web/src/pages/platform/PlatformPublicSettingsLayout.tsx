import { Outlet } from 'react-router-dom'
import { PlatformPublicSettingsProvider } from '@/hooks/usePlatformPublicSettings'

export function PlatformPublicSettingsLayout() {
  return (
    <PlatformPublicSettingsProvider>
      <Outlet />
    </PlatformPublicSettingsProvider>
  )
}
