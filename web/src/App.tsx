import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from '@/context/AppProvider'
import { AppShell } from '@/components/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireSubscription } from '@/components/RequireSubscription'
import { HomeRedirect } from '@/components/HomeRedirect'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { InvoicesPage } from '@/pages/InvoicesPage'
import { InvoiceEditorPage } from '@/pages/InvoiceEditorPage'
import { VouchersPage } from '@/pages/VouchersPage'
import { BankPage } from '@/pages/BankPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { MembersPage } from '@/pages/MembersPage'
import { VatPage } from '@/pages/VatPage'

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<HomeRedirect />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route element={<AppShell />}>
              <Route path="/app/dashboard" element={<DashboardPage />} />
              <Route path="/app/settings" element={<SettingsPage />} />
              <Route path="/app/members" element={<MembersPage />} />
              <Route element={<RequireSubscription />}>
                <Route path="/app/invoices" element={<InvoicesPage />} />
                <Route path="/app/invoices/new" element={<InvoiceEditorPage />} />
                <Route path="/app/invoices/:id" element={<InvoiceEditorPage />} />
                <Route path="/app/vouchers" element={<VouchersPage />} />
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
