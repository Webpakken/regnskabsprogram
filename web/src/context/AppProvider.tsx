import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { CompanyRole, Database } from '@/types/database'
import { trialStatusFor } from '@/lib/trial'
import type { BillingEntitlement, BillingFeatureKey } from '@/lib/billingEntitlements'
import { canUseFeature, getFeatureLimit } from '@/lib/billingEntitlements'
import { getOrCreateDeviceId } from '@/lib/trustedDevice'

type Company = Database['public']['Tables']['companies']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Subscription = Database['public']['Tables']['subscriptions']['Row']

export type PlatformStaffRole = 'superadmin' | 'support_admin'

export type ImpersonationInfo = {
  companyId: string
  expiresAt: string
}

type AppContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  companies: Company[]
  currentCompany: Company | null
  rolesByCompany: Record<string, CompanyRole>
  currentRole: CompanyRole | null
  subscription: Subscription | null
  billingEntitlements: BillingEntitlement[]
  platformRole: PlatformStaffRole | null
  impersonation: ImpersonationInfo | null
  /** Antal virksomheder brugeren er medlem af (ikke impersonation). */
  tenantCompanyCount: number
  loading: boolean
  /** True hvis brugeren har TOTP-faktor men sessionen kun er aal1 og skal udfordres. */
  aalNeedsUpgrade: boolean
  refresh: () => Promise<void>
  setCurrentCompanyId: (id: string) => Promise<void>
  canUse: (featureKey: BillingFeatureKey) => boolean
  getLimit: (featureKey: BillingFeatureKey) => number | null
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [rolesByCompany, setRolesByCompany] = useState<Record<string, CompanyRole>>({})
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [billingEntitlements, setBillingEntitlements] = useState<BillingEntitlement[]>([])
  const [platformRole, setPlatformRole] = useState<PlatformStaffRole | null>(null)
  const [impersonation, setImpersonation] = useState<ImpersonationInfo | null>(null)
  const [tenantCompanyCount, setTenantCompanyCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [aalNeedsUpgrade, setAalNeedsUpgrade] = useState(false)

  /**
   * Kun første indlæsning (eller efter logout) må sætte `loading` og fylde skærmen med «Indlæser…».
   * Ellers ville hvert `load()`-kald — fx fra `onAuthStateChange` — blokere hele appen ved navigation.
   */
  const shouldBlockUiForAuthLoad = useRef(true)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSession(null)
      setUser(null)
      setProfile(null)
      setCompanies([])
      setRolesByCompany({})
      setSubscription(null)
      setBillingEntitlements([])
      setPlatformRole(null)
      setImpersonation(null)
      setTenantCompanyCount(0)
      shouldBlockUiForAuthLoad.current = true
      setLoading(false)
      return
    }
    if (shouldBlockUiForAuthLoad.current) {
      setLoading(true)
    }
    const { data: sessionData } = await supabase.auth.getSession()
    const s = sessionData.session
    setSession(s)
    setUser(s?.user ?? null)
    if (!s?.user) {
      setProfile(null)
      setCompanies([])
      setRolesByCompany({})
      setSubscription(null)
      setBillingEntitlements([])
      setPlatformRole(null)
      setImpersonation(null)
      setTenantCompanyCount(0)
      setAalNeedsUpgrade(false)
      shouldBlockUiForAuthLoad.current = true
      setLoading(false)
      return
    }

    // Tjek om sessionen kun er aal1 men brugeren har en aal2-faktor (TOTP).
    const aalRes = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    let needsUpgrade =
      !!aalRes.data && aalRes.data.currentLevel !== aalRes.data.nextLevel
    if (needsUpgrade) {
      // "Husk denne enhed": hvis vi har et gyldigt trusted-device record, skip 2FA-prompt.
      const deviceId = getOrCreateDeviceId()
      const { data: trusted } = await supabase
        .from('mfa_trusted_devices')
        .select('id')
        .eq('user_id', s.user.id)
        .eq('device_id', deviceId)
        .gt('expires_at', new Date().toISOString())
        .limit(1)
      if (trusted && trusted.length > 0) {
        needsUpgrade = false
      }
    }
    setAalNeedsUpgrade(needsUpgrade)
    if (needsUpgrade) {
      // Stop her — ProtectedRoute viderestiller til /login/2fa.
      // Bevar `shouldBlockUiForAuthLoad=true` så næste load (efter MFA-verify) viser
      // "Indlæser…" mens companies/profile hentes — ellers flasher HomeRedirect /onboarding.
      setLoading(false)
      return
    }

    const rpcRole = await supabase.rpc('get_my_platform_role')
    let resolvedPlatformRole: PlatformStaffRole | null = null
    if (!rpcRole.error && rpcRole.data) {
      resolvedPlatformRole = rpcRole.data as PlatformStaffRole
    } else {
      const { data: psRow } = await supabase
        .from('platform_staff')
        .select('role')
        .eq('user_id', s.user.id)
        .maybeSingle()
      resolvedPlatformRole = (psRow?.role as PlatformStaffRole) ?? null
    }
    setPlatformRole(resolvedPlatformRole)

    const { data: impRow } = await supabase
      .from('support_impersonation')
      .select('company_id, expires_at')
      .eq('user_id', s.user.id)
      .maybeSingle()
    if (
      impRow &&
      new Date(impRow.expires_at).getTime() > Date.now()
    ) {
      setImpersonation({
        companyId: impRow.company_id,
        expiresAt: impRow.expires_at,
      })
    } else {
      setImpersonation(null)
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', s.user.id)
      .maybeSingle()

    setProfile(prof)

    const { data: memberships } = await supabase
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', s.user.id)

    const ids = memberships?.map((m) => m.company_id) ?? []
    setTenantCompanyCount(ids.length)
    const roles: Record<string, CompanyRole> = {}
    for (const m of memberships ?? []) {
      roles[m.company_id] = m.role as CompanyRole
    }
    setRolesByCompany(roles)
    let list: Company[] = []
    if (ids.length > 0) {
      const { data: comps } = await supabase
        .from('companies')
        .select('*')
        .in('id', ids)
      list = comps ?? []
    }
    const curCid = prof?.current_company_id
    if (curCid && !list.some((c) => c.id === curCid)) {
      const { data: extra } = await supabase
        .from('companies')
        .select('*')
        .eq('id', curCid)
        .maybeSingle()
      if (extra) list = [...list, extra]
    }
    setCompanies(list)

    let companyId = prof?.current_company_id
    if (!companyId && list[0]) {
      companyId = list[0].id
      await supabase
        .from('profiles')
        .update({ current_company_id: companyId })
        .eq('id', s.user.id)
      setProfile((p) =>
        p ? { ...p, current_company_id: companyId } : p,
      )
    }

    if (companyId) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle()
      setSubscription(sub)
      const { data: entitlements, error: entitlementsError } = await supabase.rpc(
        'get_company_feature_entitlements',
        { p_company_id: companyId },
      )
      setBillingEntitlements(
        entitlementsError ? [] : ((entitlements ?? []) as BillingEntitlement[]),
      )
    } else {
      setSubscription(null)
      setBillingEntitlements([])
    }

    setLoading(false)
    shouldBlockUiForAuthLoad.current = false
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    void load()
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'TOKEN_REFRESHED') {
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        return
      }
      void load()
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const setCurrentCompanyId = useCallback(async (id: string) => {
    if (!isSupabaseConfigured) return
    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData.session?.user?.id
    if (!uid) return
    await supabase
      .from('profiles')
      .update({ current_company_id: id })
      .eq('id', uid)
    await load()
  }, [load])

  const currentCompany = useMemo(() => {
    const cid = profile?.current_company_id
    if (!cid) return null
    return companies.find((c) => c.id === cid) ?? null
  }, [companies, profile?.current_company_id])

  const currentRole = useMemo<CompanyRole | null>(() => {
    if (!currentCompany) return null
    const r = rolesByCompany[currentCompany.id]
    if (r) return r
    /* Platform staff impersonation: ikke medlem, men har adgang via RLS */
    if (platformRole && profile?.current_company_id === currentCompany.id) {
      return 'bookkeeper'
    }
    return null
  }, [currentCompany, rolesByCompany, platformRole, profile?.current_company_id])

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      companies,
      currentCompany,
      rolesByCompany,
      currentRole,
      subscription,
      billingEntitlements,
      platformRole,
      impersonation,
      tenantCompanyCount,
      loading,
      aalNeedsUpgrade,
      refresh: load,
      setCurrentCompanyId,
      canUse: (featureKey: BillingFeatureKey) =>
        canUseFeature(billingEntitlements, featureKey),
      getLimit: (featureKey: BillingFeatureKey) =>
        getFeatureLimit(billingEntitlements, featureKey),
    }),
    [
      session,
      user,
      profile,
      companies,
      currentCompany,
      rolesByCompany,
      currentRole,
      subscription,
      billingEntitlements,
      platformRole,
      impersonation,
      tenantCompanyCount,
      loading,
      aalNeedsUpgrade,
      load,
      setCurrentCompanyId,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp uden AppProvider')
  return ctx
}

export function subscriptionOk(sub: Subscription | null) {
  if (!sub) return false
  if (sub.status === 'active') return true
  if (sub.status === 'trialing') {
    if (!sub.current_period_end) return true
    return new Date(sub.current_period_end).getTime() > Date.now()
  }
  return false
}

/**
 * Samlet adgangs-check: OK hvis enten Stripe-subscription er aktiv/trialing,
 * eller hvis den 30-dages custom prøveperiode (baseret på companies.created_at)
 * ikke er udløbet. Bruges af RequireSubscription og i UI-gating (banner/modal).
 */
export function accessOk(
  company: Company | null,
  sub: Subscription | null,
): boolean {
  if (subscriptionOk(sub)) return true
  const trial = trialStatusFor(company)
  return trial?.active === true
}

export function hasRole(
  role: CompanyRole | null,
  allowed: readonly CompanyRole[],
): boolean {
  return role !== null && allowed.includes(role)
}

export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'Ejer',
  manager: 'Manager',
  bookkeeper: 'Bogholder',
  accountant: 'Revisor',
}
