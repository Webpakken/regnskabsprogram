import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from '@/context/AppProvider'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AppShell } from '@/components/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ProtectedPlatformRoute } from '@/components/ProtectedPlatformRoute'
import { PlatformShell } from '@/components/PlatformShell'
import { RequireSubscription } from '@/components/RequireSubscription'
import { HomeRedirect } from '@/components/HomeRedirect'
import { LandingPage } from '@/pages/LandingPage'
import { SupportHoursPage } from '@/pages/SupportHoursPage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { InvoicesPage } from '@/pages/InvoicesPage'
import { InvoiceEditorPage } from '@/pages/InvoiceEditorPage'
import { InvoiceWizardPage } from '@/pages/InvoiceWizardPage'
import { InvoicePdfPage } from '@/pages/InvoicePdfPage'
import { VouchersPage } from '@/pages/VouchersPage'
import { ScanBilagPage } from '@/pages/ScanBilagPage'
import { BankPage } from '@/pages/BankPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { MembersPage } from '@/pages/MembersPage'
import { VatPage } from '@/pages/VatPage'
import { MorePage } from '@/pages/MorePage'
import { SupportPage } from '@/pages/SupportPage'
import { PlatformDashboardPage } from '@/pages/platform/PlatformDashboardPage'
import { PlatformCompaniesPage } from '@/pages/platform/PlatformCompaniesPage'
import { PlatformSupportPage } from '@/pages/platform/PlatformSupportPage'
import { PlatformSettingsLayout } from '@/pages/platform/PlatformSettingsLayout'
import { PlatformPublicSettingsPage } from '@/pages/platform/PlatformPublicSettingsPage'
import { PlatformSmtpSettingsPage } from '@/pages/platform/PlatformSmtpSettingsPage'
import { PlatformStaffPage } from '@/pages/platform/PlatformStaffPage'

function MissingConfigPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16 text-slate-800">
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-amber-950">Manglende konfiguration</h1>
        <p className="mt-3 text-sm leading-relaxed text-amber-950/90">
          Tilføj miljøvariablerne{' '}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">
            VITE_SUPABASE_URL
          </code>{' '}
          og{' '}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">
            VITE_SUPABASE_ANON_KEY
          </code>{' '}
          i dit hosting-dashboard (samme værdier som i{' '}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">
            web/.env.local
          </code>
          ), og deploy igen.
        </p>
        <p className="mt-4 text-xs text-amber-900/80">
          Uden dem er der ofte helt hvid skærm, fordi appen ikke kan tale med Supabase.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <MissingConfigPage />
  }
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/support-tider" element={<SupportHoursPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<ProtectedPlatformRoute />}>
              <Route element={<PlatformShell />}>
                <Route path="/platform/dashboard" element={<PlatformDashboardPage />} />
                <Route path="/platform/companies" element={<PlatformCompaniesPage />} />
                <Route path="/platform/support" element={<PlatformSupportPage />} />
                <Route path="/platform/settings" element={<PlatformSettingsLayout />}>
                  <Route
                    index
                    element={<Navigate to="/platform/settings/public" replace />}
                  />
                  <Route path="public" element={<PlatformPublicSettingsPage />} />
                  <Route path="smtp" element={<PlatformSmtpSettingsPage />} />
                </Route>
                <Route path="/platform/staff" element={<PlatformStaffPage />} />
              </Route>
            </Route>
            <Route path="/home" element={<HomeRedirect />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route element={<AppShell />}>
              <Route path="/app/dashboard" element={<DashboardPage />} />
              <Route path="/app/settings" element={<SettingsPage />} />
              <Route path="/app/more" element={<MorePage />} />
              <Route path="/app/members" element={<MembersPage />} />
              <Route element={<RequireSubscription />}>
                <Route path="/app/support" element={<SupportPage />} />
                <Route path="/app/invoices" element={<InvoicesPage />} />
                <Route path="/app/invoices/new" element={<InvoiceWizardPage />} />
                <Route path="/app/invoices/:id/pdf" element={<InvoicePdfPage />} />
                <Route path="/app/invoices/:id" element={<InvoiceWizardPage />} />
                <Route path="/app/invoices/:id/classic" element={<InvoiceEditorPage />} />
                <Route path="/app/vouchers" element={<VouchersPage />} />
                <Route path="/app/vouchers/scan" element={<ScanBilagPage />} />
                <Route path="/app/bank" element={<BankPage />} />
                <Route path="/app/vat" element={<VatPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}
