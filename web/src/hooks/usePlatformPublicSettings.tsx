import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'

export type PublicSettings = Database['public']['Tables']['platform_public_settings']['Row']

type PublicSettingsContextValue = {
  pub: Partial<PublicSettings>
  setPub: React.Dispatch<React.SetStateAction<Partial<PublicSettings>>>
  loading: boolean
  saving: boolean
  message: string | null
  error: string | null
  saveFields: (fields: Partial<PublicSettings>, successMsg: string) => Promise<void>
}

const PublicSettingsContext = createContext<PublicSettingsContextValue | null>(null)

export function PlatformPublicSettingsProvider({ children }: { children: ReactNode }) {
  const [pub, setPub] = useState<Partial<PublicSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('platform_public_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setPub(data ?? {})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const saveFields = useCallback(
    async (fields: Partial<PublicSettings>, successMsg: string) => {
      setSaving(true)
      setMessage(null)
      setError(null)
      const { error: uErr } = await supabase
        .from('platform_public_settings')
        .update({
          ...fields,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
      setSaving(false)
      if (uErr) {
        setError(uErr.message)
        return
      }
      setMessage(successMsg)
      await load()
    },
    [load],
  )

  const value = useMemo(
    () => ({
      pub,
      setPub,
      loading,
      saving,
      message,
      error,
      saveFields,
    }),
    [pub, loading, saving, message, error, saveFields],
  )

  return (
    <PublicSettingsContext.Provider value={value}>
      {children}
    </PublicSettingsContext.Provider>
  )
}

export function usePlatformPublicSettings(): PublicSettingsContextValue {
  const ctx = useContext(PublicSettingsContext)
  if (!ctx) {
    throw new Error('usePlatformPublicSettings uden PlatformPublicSettingsProvider')
  }
  return ctx
}
