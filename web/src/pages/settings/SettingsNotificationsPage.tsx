import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import {
  canUseWebPush,
  hasWebPushSubscription,
  isStandaloneIosPwa,
  registerWebPushSubscriptionDetailed,
} from '@/lib/pushClient'
import type { Database } from '@/types/database'

type PrefRow = Database['public']['Tables']['notification_preferences']['Row']

type PrefState = Pick<
  PrefRow,
  | 'support_replies'
  | 'member_invites'
  | 'invoice_sent'
  | 'invoice_reminders'
  | 'subscription_updates'
  | 'platform_new_companies'
  | 'platform_new_support'
  | 'platform_new_subscriptions'
>

const DEFAULT_PREFS: PrefState = {
  support_replies: true,
  member_invites: true,
  invoice_sent: true,
  invoice_reminders: true,
  subscription_updates: true,
  platform_new_companies: true,
  platform_new_support: true,
  platform_new_subscriptions: true,
}

function ToggleRow(props: {
  id: keyof PrefState
  title: string
  body: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  const { id, title, body, checked, disabled, onChange } = props
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export function SettingsNotificationsPage() {
  const { user, platformRole } = useApp()
  const [prefs, setPrefs] = useState<PrefState>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      const { data, error: loadError } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
        setPrefs(DEFAULT_PREFS)
        setLoading(false)
        return
      }
      setPrefs(data ? { ...DEFAULT_PREFS, ...data } : DEFAULT_PREFS)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    async function loadPushStatus() {
      if (!canUseWebPush()) {
        if (!cancelled) setPushEnabled(false)
        return
      }
      const ok = await hasWebPushSubscription()
      if (!cancelled) setPushEnabled(ok)
    }
    void loadPushStatus()
    return () => {
      cancelled = true
    }
  }, [])

  function setPref<K extends keyof PrefState>(key: K, value: PrefState[K]) {
    setMessage(null)
    setError(null)
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setMessage(null)
    setError(null)
    const { error: saveError } = await supabase.from('notification_preferences').upsert({
      user_id: user.id,
      ...prefs,
    })
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setMessage('Indstillinger gemt.')
  }

  async function enablePush() {
    setPushBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await registerWebPushSubscriptionDetailed()
      setPushEnabled(result.ok)
      if (!result.ok) {
        setError(
          result.detail
            ? `Push-fejl (${result.stage}): ${result.detail}`
            : `Push-fejl (${result.stage}).`,
        )
      } else {
        setMessage('Push-notifikationer er aktiveret på denne enhed.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push kunne ikke aktiveres.')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void save(e)}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-medium text-slate-900">Notifikationer</h2>
          <p className="mt-1 text-sm text-slate-600">
            Vælg hvad du vil have besked om. Første version gemmer simple til/fra-valg pr. bruger.
          </p>
        </div>

        {canUseWebPush() ? (
          <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Push på denne enhed</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {pushEnabled
                    ? 'Push er aktiv på denne enhed.'
                    : isStandaloneIosPwa()
                      ? 'På iPhone PWA skal push aktiveres ved et direkte tryk på knappen herunder.'
                      : 'Aktivér push, så du kan få besked uden at have appen åben.'}
                </p>
              </div>
              <button
                type="button"
                disabled={pushBusy || pushEnabled}
                onClick={() => void enablePush()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {pushEnabled ? 'Push aktiv' : pushBusy ? 'Aktiverer…' : 'Slå push til'}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-950">Push ikke klar</h3>
            <p className="mt-1 text-sm text-amber-900/90">
              Denne build mangler Web Push-konfiguration eller en understøttet browser/PWA-kontekst.
            </p>
          </section>
        )}

        {loading ? (
          <p className="text-sm text-slate-600">Indlæser notifikationsindstillinger…</p>
        ) : (
          <>
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Min konto
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Relevante beskeder om support, samarbejde, faktura og abonnement.
                </p>
              </div>

              <ToggleRow
                id="support_replies"
                title="Support-svar"
                body="Få besked når Bilago svarer på din supporttråd."
                checked={prefs.support_replies}
                onChange={(next) => setPref('support_replies', next)}
              />
              <ToggleRow
                id="member_invites"
                title="Medlemsinvitationer"
                body="Få besked når du inviteres til en virksomhed eller et samarbejde."
                checked={prefs.member_invites}
                onChange={(next) => setPref('member_invites', next)}
              />
              <ToggleRow
                id="invoice_sent"
                title="Faktura sendt"
                body="Få besked når en faktura sendes til en kunde."
                checked={prefs.invoice_sent}
                onChange={(next) => setPref('invoice_sent', next)}
              />
              <ToggleRow
                id="invoice_reminders"
                title="Betalingspåmindelser og rykkere"
                body="Få besked når en betalingspåmindelse eller rykker bliver sendt."
                checked={prefs.invoice_reminders}
                onChange={(next) => setPref('invoice_reminders', next)}
              />
              <ToggleRow
                id="subscription_updates"
                title="Abonnement og betaling"
                body="Få besked om ændringer i abonnement, betalinger og prøveperiode."
                checked={prefs.subscription_updates}
                onChange={(next) => setPref('subscription_updates', next)}
              />
            </section>

            {platformRole ? (
              <section className="space-y-3 border-t border-slate-200 pt-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Platform admin
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Ekstra beskeder til dig som arbejder i platformen.
                  </p>
                </div>

                <ToggleRow
                  id="platform_new_companies"
                  title="Nye virksomheder"
                  body="Få besked når en ny virksomhed bliver oprettet."
                  checked={prefs.platform_new_companies}
                  onChange={(next) => setPref('platform_new_companies', next)}
                />
                <ToggleRow
                  id="platform_new_support"
                  title="Nye supporthenvendelser"
                  body="Få besked når en kunde skriver en ny supportbesked."
                  checked={prefs.platform_new_support}
                  onChange={(next) => setPref('platform_new_support', next)}
                />
                <ToggleRow
                  id="platform_new_subscriptions"
                  title="Nye abonnementer"
                  body="Få besked når et abonnement bliver oprettet eller ændret."
                  checked={prefs.platform_new_subscriptions}
                  onChange={(next) => setPref('platform_new_subscriptions', next)}
                />
              </section>
            ) : null}
          </>
        )}

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-emerald-700" role="status">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || saving || !user}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Gemmer…' : 'Gem notifikationer'}
        </button>
      </form>
    </div>
  )
}
