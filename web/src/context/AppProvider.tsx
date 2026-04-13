import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Company = Database['public']['Tables']['companies']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Subscription = Database['public']['Tables']['subscriptions']['Row']

type AppContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  companies: Company[]
  currentCompany: Company | null
  subscription: Subscription | null
  loading: boolean
  refresh: () => Promise<void>
  setCurrentCompanyId: (id: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const s = sessionData.session
    setSession(s)
    setUser(s?.user ?? null)
    if (!s?.user) {
      setProfile(null)
      setCompanies([])
      setSubscription(null)
      setLoading(false)
      return
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', s.user.id)
      .maybeSingle()

    setProfile(prof)

    const { data: memberships } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', s.user.id)

    const ids = memberships?.map((m) => m.company_id) ?? []
    let list: Company[] = []
    if (ids.length > 0) {
      const { data: comps } = await supabase
        .from('companies')
        .select('*')
        .in('id', ids)
      list = comps ?? []
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
    } else {
      setSubscription(null)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void load()
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const setCurrentCompanyId = useCallback(async (id: string) => {
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

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      companies,
      currentCompany,
      subscription,
      loading,
      refresh: load,
      setCurrentCompanyId,
    }),
    [
      session,
      user,
      profile,
      companies,
      currentCompany,
      subscription,
      loading,
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
  return sub?.status === 'active' || sub?.status === 'trialing'
}
